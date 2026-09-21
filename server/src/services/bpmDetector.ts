import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const unlinkAsync = promisify(fs.unlink);
const writeFileAsync = promisify(fs.writeFile);

const SAMPLE_RATE = 22050;
const WINDOW = 1024;
const HOP = 256;
const BPM_MIN = 60;
const BPM_MAX = 200;

// Read sidecar URL from env var or fallback to container network name
const SIDECAR_BASE_URL = process.env.BPM_SIDECAR_URL || 'http://rap-beats-bpm:5050';
const SIDECAR_TIMEOUT_MS = 20000; // 20s — librosa on 60s audio window takes ~10-15s

export interface BpmDetectionResult {
  bpm: number;
  confidence: number;
  beat_count: number;
  duration_seconds: number;
  onset_strength_mean: number;
  key: string;
  key_root: string;
  key_mode: string;
  key_confidence: number;
}

// ─── Sidecar (librosa v5) ───────────────────────────────────────────────────

async function detectViaSidecar(buffer: Buffer, filename: string): Promise<BpmDetectionResult | null> {
  try {
    const form = new FormData();
    form.append('audio', new Blob([buffer as unknown as BlobPart], { type: 'audio/mpeg' }), filename);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SIDECAR_TIMEOUT_MS);

    try {
      const r = await fetch(`${SIDECAR_BASE_URL}/detect`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });

      if (!r.ok) {
        console.warn(`[BpmDetector] sidecar returned ${r.status}`);
        return null;
      }

      const json = await r.json() as {
        bpm?: number;
        confidence?: number;
        duration_s?: number;
        beat_count?: number;
        key?: string;
        key_confidence?: number;
        error?: string;
        onset_score?: number;
        align_score?: number;
        cv?: number;
        onset_type?: string;
      };

      if (json.error) {
        console.warn(`[BpmDetector] sidecar error:`, json.error);
        return null;
      }

      return {
        bpm: json.bpm ?? 0,
        confidence: json.confidence ?? 0,
        beat_count: json.beat_count ?? 0,
        duration_seconds: json.duration_s ?? 0,
        onset_strength_mean: json.onset_score ?? 0,
        key: json.key ?? '',
        key_root: '',
        key_mode: '',
        key_confidence: json.key_confidence ?? 0,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err: unknown) {
    const e = err as Error;
    if (e.name === 'AbortError') {
      console.warn(`[BpmDetector] sidecar timeout after ${SIDECAR_TIMEOUT_MS}ms`);
    } else {
      console.warn(`[BpmDetector] sidecar unavailable: ${e.message}`);
    }
    return null;
  }
}

// ─── Sidecar health check ────────────────────────────────────────────────────

/**
 * 探测 sidecar 是否可用。后端启动时调用，用于在日志中明确提示
 * 当前走的是 sidecar 还是降级链路（Python 子进程 / JS）。
 */
export async function checkSidecarHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const r = await fetch(`${SIDECAR_BASE_URL}/health`, { signal: controller.signal });
      return r.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

// ─── Python subprocess fallback (has key detection) ──────────────────────────

const PYTHON_TIMEOUT_MS = 60000; // 60s — librosa analysis on 60s window

async function detectViaPython(filePath: string): Promise<BpmDetectionResult | null> {
  return new Promise((resolve) => {
    // Find the detect_bpm.py script relative to server/src
    const scriptPath = path.resolve(__dirname, '../scripts/detect_bpm.py');
    const proc = spawn('python3', [scriptPath, filePath, '--json']);

    // ─── 资源上限保护，防止恶意/畸形文件触发 OOM ───
    // stdout：bpm 输出通常 < 4KB（JSON），10MB 足够
    // stderr：异常诊断，1MB 上限
    const MAX_STDOUT = 10 * 1024 * 1024;
    const MAX_STDERR = 1 * 1024 * 1024;
    let stdoutTruncated = false;
    let stderr = '';

    let stdout = '';
    let timer: ReturnType<typeof setTimeout> | null = null;

    const killProcess = (reason: string) => {
      if (timer) { clearTimeout(timer); timer = null; }
      try { proc.kill('SIGKILL'); } catch {}
      console.warn(`[BpmDetector] python fallback killed: ${reason}`);
      resolve(null);
    };

    timer = setTimeout(() => killProcess(`timeout ${PYTHON_TIMEOUT_MS}ms`), PYTHON_TIMEOUT_MS);

    proc.stdout.on('data', (c: Buffer) => {
      if (stdoutTruncated) return;
      if (stdout.length + c.length > MAX_STDOUT) {
        stdoutTruncated = true;
        killProcess('stdout exceeded 10MB');
        return;
      }
      stdout += c.toString();
    });
    proc.stderr.on('data', (c: Buffer) => {
      if (stderr.length + c.length > MAX_STDERR) return;
      stderr += c.toString();
    });
    proc.on('close', (code) => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (code !== 0 || !stdout.trim()) {
        if (stderr.trim()) {
          console.warn(`[BpmDetector] python fallback exited ${code}: ${stderr.trim()}`);
        }
        resolve(null);
        return;
      }
      try {
        const json = JSON.parse(stdout.trim());
        resolve({
          bpm: json.bpm ?? 0,
          confidence: json.confidence ?? 0,
          beat_count: json.beat_count ?? 0,
          duration_seconds: json.duration_seconds ?? 0,
          onset_strength_mean: json.onset_strength_mean ?? 0,
          key: json.key ?? '',
          key_root: json.key_root ?? '',
          key_mode: json.key_mode ?? '',
          key_confidence: json.key_confidence ?? 0,
        });
      } catch {
        resolve(null);
      }
    });
    proc.on('error', () => {
      if (timer) { clearTimeout(timer); timer = null; }
      resolve(null);
    });
  });
}

// ─── Original JS detector (fallback — BPM only, no key) ────────────────────

function decodeToPcm(filePath: string, timeoutMs = 30000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-loglevel', 'error',
      '-i', filePath,
      '-ac', '1',
      '-ar', String(SAMPLE_RATE),
      '-f', 's16le',
      'pipe:1',
    ]);
    const chunks: Buffer[] = [];
    let stderr = '';
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error(`ffmpeg timeout ${timeoutMs}ms`)); }, timeoutMs);

    proc.stdout.on('data', (c: Buffer) => chunks.push(c));
    proc.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`ffmpeg ${code}: ${stderr}`));
      else resolve(Buffer.concat(chunks));
    });
  });
}

function estimateBpm(pcm: Buffer): { bpm: number; confidence: number; onsetMean: number } {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const totalFrames = Math.max(1, Math.floor((samples.length - WINDOW) / HOP));
  const energy = new Float64Array(totalFrames);

  for (let f = 0; f < totalFrames; f++) {
    let sum = 0;
    const start = f * HOP;
    for (let i = 0; i < WINDOW; i++) {
      const s = samples[start + i] / 32768;
      sum += s * s;
    }
    energy[f] = sum;
  }

  const onset = new Float64Array(totalFrames);
  let onsetSum = 0;
  for (let f = 1; f < totalFrames; f++) {
    onset[f] = Math.max(0, energy[f] - energy[f - 1]);
    onsetSum += onset[f];
  }
  const onsetMean = onsetSum / Math.max(1, totalFrames);

  const frameRate = SAMPLE_RATE / HOP;
  const corrAtLag = (lagF: number): number => {
    let num = 0, denA = 0, denB = 0;
    const end = totalFrames - 1 - lagF;
    for (let i = 0; i < end; i++) {
      const j = i + lagF;
      const j0 = Math.floor(j);
      const frac = j - j0;
      const v = onset[j0] * (1 - frac) + onset[j0 + 1] * frac;
      num += onset[i] * v;
      denA += onset[i] * onset[i];
      denB += v * v;
    }
    return num / (Math.sqrt(denA * denB) || 1);
  };

  let bestBpm = BPM_MIN;
  let bestScore = -1;
  for (let bpm = BPM_MIN; bpm <= BPM_MAX; bpm += 0.5) {
    const lag = (frameRate * 60) / bpm;
    if (lag < 3 || lag >= totalFrames - 2) continue;
    const score = corrAtLag(lag);
    if (score > bestScore) { bestScore = score; bestBpm = bpm; }
  }

  const harmonics = [1, 2, 3, 4]
    .map((k) => ({ k, bpm: bestBpm * k }))
    .filter((h) => h.bpm <= BPM_MAX);
  let chosen = { bpm: bestBpm, score: bestScore };
  for (const h of harmonics) {
    const score = corrAtLag((frameRate * 60) / h.bpm);
    if (score >= chosen.score * 0.85 && score >= chosen.score - 0.02) {
      chosen = { bpm: h.bpm, score };
    }
  }

  return {
    bpm: Math.round(chosen.bpm),
    confidence: Math.max(0, Math.min(1, chosen.score)),
    onsetMean,
  };
}

async function detectFromFile(filePath: string): Promise<BpmDetectionResult | null> {
  try {
    const pcm = await decodeToPcm(filePath);
    if (pcm.length < SAMPLE_RATE * 2) return null;
    const { bpm, confidence, onsetMean } = estimateBpm(pcm);
    const durationSeconds = pcm.length / 2 / SAMPLE_RATE;
    return {
      bpm,
      confidence: Number(confidence.toFixed(4)),
      beat_count: Math.round((durationSeconds / 60) * bpm),
      duration_seconds: Number(durationSeconds.toFixed(2)),
      onset_strength_mean: Number(onsetMean.toFixed(6)),
      key: '',
      key_root: '',
      key_mode: '',
      key_confidence: 0,
    };
  } catch (err) {
    console.error('[BpmDetector] JS fallback failed:', err);
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Detect BPM from an audio buffer (MP3/WAV/FLAC/M4A/OGG).
 * Strategy: sidecar (librosa v5) first → Python subprocess fallback → JS fallback.
 */
export async function detectBpmFromBuffer(
  buffer: Buffer,
  originalName: string,
): Promise<BpmDetectionResult | null> {
  // Try sidecar first (librosa v5 — more accurate for real rap beats)
  const sidecarResult = await detectViaSidecar(buffer, originalName);
  if (sidecarResult && sidecarResult.bpm > 0) {
    return sidecarResult;
  }

  // Fallback 1: Python subprocess (has key detection)
  const ext = path.extname(originalName).toLowerCase() || '.mp3';
  const tmpFile = path.join(os.tmpdir(), `bpm_py_${Date.now()}${ext}`);
  try {
    await writeFileAsync(tmpFile, buffer);
    const pyResult = await detectViaPython(tmpFile);
    if (pyResult && pyResult.bpm > 0) {
      return pyResult;
    }
  } catch (err) {
    console.warn('[BpmDetector] Python fallback failed:', (err as Error).message);
  }

  // Fallback 2: JS detector (BPM only, no key)
  try {
    return await detectFromFile(tmpFile);
  } catch (err) {
    console.error('[BpmDetector] all fallbacks failed:', err);
    return null;
  } finally {
    try { await unlinkAsync(tmpFile); } catch { /* ignore */ }
  }
}

/**
 * Detect BPM from a local file path.
 * Uses Python subprocess (has key detection) → JS fallback.
 */
export async function detectBpmFromFile(filePath: string): Promise<BpmDetectionResult | null> {
  try {
    const pyResult = await detectViaPython(filePath);
    if (pyResult && pyResult.bpm > 0) {
      return pyResult;
    }
  } catch (err) {
    console.warn('[BpmDetector] Python fallback failed for file:', (err as Error).message);
  }
  // JS fallback
  return detectFromFile(filePath);
}

/**
 * Detect BPM from an OSS URL: download to temp file, then sidecar → Python fallback → JS fallback.
 */
export async function detectBpmFromUrl(ossUrl: string): Promise<BpmDetectionResult | null> {
  const tmpFile = path.join(os.tmpdir(), `bpm_url_${Date.now()}.mp3`);
  try {
    await new Promise<void>((resolve, reject) => {
      const curl = spawn('curl', ['-sL', '-o', tmpFile, ossUrl, '--max-time', '60']);
      curl.on('close', (code) => code === 0 ? resolve() : reject(new Error(`curl ${code}`)));
      curl.on('error', reject);
    });
    const buf = await fs.promises.readFile(tmpFile);

    // Try sidecar first
    const sidecarResult = await detectViaSidecar(buf, path.basename(tmpFile));
    if (sidecarResult && sidecarResult.bpm > 0) return sidecarResult;

    // Python fallback
    const pyResult = await detectViaPython(tmpFile);
    if (pyResult && pyResult.bpm > 0) return pyResult;

    // JS fallback
    return await detectFromFile(tmpFile);
  } catch (err) {
    console.error('[BpmDetector] URL detection failed:', err);
    return null;
  } finally {
    try { await unlinkAsync(tmpFile); } catch { /* ignore */ }
  }
}
