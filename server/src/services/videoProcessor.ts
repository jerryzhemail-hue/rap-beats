/**
 * 视频处理服务：探测时长、截取封面。
 * 使用系统 ffmpeg（如可用）；不可用时返回 null 让调用方兜底。
 */
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

export interface VideoMeta {
  duration: number | null;   // 秒
  width: number | null;
  height: number | null;
}

/**
 * 用 ffprobe 探测视频元数据。
 */
export async function probeVideoMeta(buffer: Buffer): Promise<VideoMeta> {
  const tmpFile = path.join(os.tmpdir(), `video_probe_${Date.now()}.mp4`);
  try {
    await writeFileAsync(tmpFile, buffer);
    return await runFfprobe(tmpFile);
  } finally {
    try { await unlinkAsync(tmpFile); } catch { /* ignore */ }
  }
}

function runFfprobe(filePath: string, timeoutMs = 15000): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ]);

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('ffprobe timeout'));
    }, timeoutMs);

    let stdout = '';
    proc.stdout.on('data', (c) => { stdout += c.toString(); });
    proc.on('close', () => {
      clearTimeout(timer);
      try {
        const data = JSON.parse(stdout);
        const duration = data.format?.duration ? parseFloat(data.format.duration) : null;
        const videoStream = (data.streams || []).find((s: any) => s.codec_type === 'video');
        const width = videoStream?.width ?? null;
        const height = videoStream?.height ?? null;
        resolve({ duration, width, height });
      } catch (err) {
        reject(err as Error);
      }
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * 用 ffmpeg 截取视频第 N 秒的封面图（jpg）。
 */
export async function extractVideoCover(buffer: Buffer, atSecond = 1): Promise<Buffer | null> {
  const tmpVideo = path.join(os.tmpdir(), `video_cover_in_${Date.now()}.mp4`);
  const tmpCover = path.join(os.tmpdir(), `video_cover_out_${Date.now()}.jpg`);
  try {
    await writeFileAsync(tmpVideo, buffer);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-y',
        '-ss', String(atSecond),
        '-i', tmpVideo,
        '-frames:v', '1',
        '-q:v', '2',
        tmpCover
      ]);
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('ffmpeg cover timeout'));
      }, 20000);
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with ${code}`));
      });
      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    return await fs.promises.readFile(tmpCover);
  } catch (err) {
    console.warn('[videoProcessor] extract cover failed:', err);
    return null;
  } finally {
    try { await unlinkAsync(tmpVideo); } catch { /* ignore */ }
    try { await unlinkAsync(tmpCover); } catch { /* ignore */ }
  }
}