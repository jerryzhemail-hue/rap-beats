import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { promisify } from 'util';

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

// ─── Original JS detector (fallback) ────────────────────────────────────────

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
 * Strategy: sidecar (librosa v5) first → JS fallback if unavailable/timeout/error.
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

  // Fallback: original JS detector
  const ext = path.extname(originalName).toLowerCase() || '.mp3';
  const tmpFile = path.join(os.tmpdir(), `bpm_js_${Date.now()}${ext}`);
  try {
    await writeFileAsync(tmpFile, buffer);
    return await detectFromFile(tmpFile);
  } catch (err) {
    console.error('[BpmDetector] both sidecar and JS fallback failed:', err);
    return null;
  } finally {
    try { await unlinkAsync(tmpFile); } catch { /* ignore */ }
  }
}

/**
 * Detect BPM from a local file path.
 * Uses JS detector (sidecar not applicable for path-based access).
 */
export async function detectBpmFromFile(filePath: string): Promise<BpmDetectionResult | null> {
  return detectFromFile(filePath);
}

/**
 * Detect BPM from an OSS URL: download to temp file, then sidecar → JS fallback.
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
    // Try sidecar first (more accurate)
    const sidecarResult = await detectViaSidecar(buf, path.basename(tmpFile));
    if (sidecarResult && sidecarResult.bpm > 0) return sidecarResult;
    // Fallback: JS detector
    return await detectFromFile(tmpFile);
  } catch (err) {
    console.error('[BpmDetector] URL detection failed:', err);
    return null;
  } finally {
    try { await unlinkAsync(tmpFile); } catch { /* ignore */ }
  }
}
