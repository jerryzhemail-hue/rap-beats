import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { promisify } from 'util';

const unlinkAsync = promisify(fs.unlink);
const writeFileAsync = promisify(fs.writeFile);

const BPM_SCRIPT_PATH = path.resolve(__dirname, '../../src/scripts/detect_bpm.py');

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
 * Detect BPM from an audio buffer (MP3/WAV/FLAC/M4A/OGG).
 * Writes buffer to a temp file, runs the Python librosa script, then cleans up.
 * Returns null on failure (e.g. librosa not installed, file corrupt).
 */
export async function detectBpmFromBuffer(buffer: Buffer, originalName: string): Promise<BpmDetectionResult | null> {
  const ext = path.extname(originalName).toLowerCase() || '.mp3';
  const tmpFile = path.join(os.tmpdir(), `bpm_detect_${Date.now()}${ext}`);

  try {
    await writeFileAsync(tmpFile, buffer);

    const result = await runBpmScript(tmpFile);
    return result;
  } catch (err) {
    console.error('[BpmDetector] detection failed:', err);
    return null;
  } finally {
    try {
      await unlinkAsync(tmpFile);
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Detect BPM from a local file path (for files already on disk).
 */
export async function detectBpmFromFile(filePath: string): Promise<BpmDetectionResult | null> {
  try {
    return await runBpmScript(filePath);
  } catch (err) {
    console.error('[BpmDetector] detection failed for path:', filePath, err);
    return null;
  }
}

/**
 * Detect BPM from an OSS URL.
 * Downloads to temp file, detects, then cleans up.
 */
export async function detectBpmFromUrl(ossUrl: string): Promise<BpmDetectionResult | null> {
  const tmpFile = path.join(os.tmpdir(), `bpm_detect_url_${Date.now()}.mp3`);

  try {
    // Use curl to download the file
    await new Promise<void>((resolve, reject) => {
      const curl = spawn('curl', ['-sL', '-o', tmpFile, ossUrl, '--max-time', '60']);
      curl.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`curl exited with code ${code}`));
      });
      curl.on('error', reject);
    });

    return await runBpmScript(tmpFile);
  } catch (err) {
    console.error('[BpmDetector] URL download or detection failed:', ossUrl, err);
    return null;
  } finally {
    try {
      await unlinkAsync(tmpFile);
    } catch {
      // ignore
    }
  }
}

async function runBpmScript(filePath: string, timeoutMs = 90000): Promise<BpmDetectionResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [BPM_SCRIPT_PATH, '--json', filePath]);

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`BPM script timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`BPM script exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        resolve({
          bpm: result.bpm,
          confidence: result.confidence,
          beat_count: result.beat_count,
          duration_seconds: result.duration_seconds,
          onset_strength_mean: result.onset_strength_mean,
          key: result.key ?? '',
          key_root: result.key_root ?? '',
          key_mode: result.key_mode ?? '',
          key_confidence: result.key_confidence ?? 0,
        });
      } catch (parseErr) {
        reject(new Error(`Failed to parse BPM script output: ${stdout}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn python3: ${err.message}`));
    });
  });
}
