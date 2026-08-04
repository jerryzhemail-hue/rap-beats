import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { promisify } from 'util';

const unlinkAsync = promisify(fs.unlink);
const writeFileAsync = promisify(fs.writeFile);

const SAMPLE_RATE = 22050;
const WINDOW = 1024;
const HOP = 256; // 更小的帧长提高滞后分辨率（避免节拍周期落在整数滞后之间）
const BPM_MIN = 60;
const BPM_MAX = 200;

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

/**
 * 用 ffmpeg 把音频解码为单声道 22050Hz 16bit PCM（秒级完成，无 Python 依赖）
 */
function decodeToPcm(filePath: string, timeoutMs = 30000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-loglevel', 'error',
      '-i', filePath,
      '-ac', '1',
      '-ar', String(SAMPLE_RATE),
      '-f', 's16le',
      'pipe:1'
    ]);
    const chunks: Buffer[] = [];
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`ffmpeg decode timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on('data', (c: Buffer) => chunks.push(c));
    proc.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      else resolve(Buffer.concat(chunks));
    });
  });
}

/**
 * 能量包络 + 自相关 BPM 估算（60-200 BPM 范围）
 */
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

  // 能量差分 onset 包络
  const onset = new Float64Array(totalFrames);
  let onsetSum = 0;
  for (let f = 1; f < totalFrames; f++) {
    onset[f] = Math.max(0, energy[f] - energy[f - 1]);
    onsetSum += onset[f];
  }
  const onsetMean = onsetSum / Math.max(1, totalFrames);

  // 分数滞后自相关（线性插值），在 60-200 BPM 范围以 0.5 BPM 步长精细搜索，
  // 避免整数滞后对非整数节拍周期（如 150BPM=0.4s）对不齐的问题
  const frameRate = SAMPLE_RATE / HOP;
  const corrAtLag = (lagF: number): number => {
    let num = 0;
    let denA = 0;
    let denB = 0;
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
    const den = Math.sqrt(denA * denB) || 1;
    return num / den;
  };

  let bestBpm = BPM_MIN;
  let bestScore = -1;
  for (let bpm = BPM_MIN; bpm <= BPM_MAX; bpm += 0.5) {
    const lag = (frameRate * 60) / bpm;
    if (lag < 3 || lag >= totalFrames - 2) continue;
    const score = corrAtLag(lag);
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }

  // 谐波解析：精确周期信号在 1x/2x/3x/4x 倍频上自相关分数几乎相同，
  // 在候选倍频中选分数最高者（分数接近时优先更高 BPM），避免 150→75、180→60
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
    onsetMean
  };
}

async function detectFromFile(filePath: string): Promise<BpmDetectionResult | null> {
  try {
    const pcm = await decodeToPcm(filePath);
    if (pcm.length < SAMPLE_RATE * 2) return null; // 少于 1 秒，无法检测
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
      key_confidence: 0
    };
  } catch (err) {
    console.error('[BpmDetector] failed:', filePath, err);
    return null;
  }
}

/**
 * Detect BPM from an audio buffer (MP3/WAV/FLAC/M4A/OGG).
 * Writes buffer to a temp file, decodes with ffmpeg, analyzes, then cleans up.
 */
export async function detectBpmFromBuffer(buffer: Buffer, originalName: string): Promise<BpmDetectionResult | null> {
  const ext = path.extname(originalName).toLowerCase() || '.mp3';
  const tmpFile = path.join(os.tmpdir(), `bpm_detect_${Date.now()}${ext}`);
  try {
    await writeFileAsync(tmpFile, buffer);
    return await detectFromFile(tmpFile);
  } catch (err) {
    console.error('[BpmDetector] detection failed:', err);
    return null;
  } finally {
    try { await unlinkAsync(tmpFile); } catch { /* ignore */ }
  }
}

/**
 * Detect BPM from a local file path.
 */
export async function detectBpmFromFile(filePath: string): Promise<BpmDetectionResult | null> {
  return detectFromFile(filePath);
}

/**
 * Detect BPM from an OSS URL: download to temp file, detect, clean up.
 */
export async function detectBpmFromUrl(ossUrl: string): Promise<BpmDetectionResult | null> {
  const tmpFile = path.join(os.tmpdir(), `bpm_detect_url_${Date.now()}.mp3`);
  try {
    await new Promise<void>((resolve, reject) => {
      const curl = spawn('curl', ['-sL', '-o', tmpFile, ossUrl, '--max-time', '60']);
      curl.on('close', (code) => code === 0 ? resolve() : reject(new Error(`curl exited with code ${code}`)));
      curl.on('error', reject);
    });
    return await detectFromFile(tmpFile);
  } catch (err) {
    console.error('[BpmDetector] URL download or detection failed:', ossUrl, err);
    return null;
  } finally {
    try { await unlinkAsync(tmpFile); } catch { /* ignore */ }
  }
}
