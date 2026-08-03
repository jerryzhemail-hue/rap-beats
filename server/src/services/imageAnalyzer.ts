/**
 * 图片内容分析服务
 * 用于识别图片中的文字和视觉特征，辅助话题推荐
 */

import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// 缓存 worker 以提升性能
let tesseractWorker: Tesseract.Worker | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (!tesseractWorker) {
    tesseractWorker = await Tesseract.createWorker('eng+chi_sim', 1, {
      logger: () => {}, // 静默日志
    });
  }
  return tesseractWorker;
}

export interface ImageAnalysisResult {
  ocrText: string;
  detectedKeywords: string[];
  hasLyrics: boolean;      // 检测到疑似歌词
  hasBeat: boolean;        // 检测到节拍/Rap相关图
  hasPortrait: boolean;    // 检测到人物头像
  hasIllustration: boolean; // 检测到插画/涂鸦风格
  dominantColors: string[];
  saturation: number;       // 平均饱和度 (0-1)
  brightness: number;      // 平均亮度 (0-1)
}

function extractRapKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const keywords: string[] = [];

  // 歌词/verse 特征词
  const lyricsPatterns = [
    /verse\s*1|verse\s*2|verse\s*3/i,
    /hook|副歌/i,
    /verse|verse/i,
    /bars?\s+\d/i,
    /\[verse\]|\[hook\]|\[intro\]|\[outro\]/i,
    /\d+\s*\/\s*\d+/,  // 时间轴如 0:15
    /lyrics|歌词|verse/i,
    /\b(punchline|punch line|押韵|韵脚|flow)\b/i,
    /freestyle|cypher|battle/i,
  ];

  // Beat/编曲特征词
  const beatPatterns = [
    /\b(bpm|tempo|kick|snare|hi-hat|808|beat|beat制作|instrumental|type beat)\b/i,
    /\b(producer|编曲|采样|sample|loop)\b/i,
  ];

  // 歌手/名字特征
  const artistPatterns = [
    /\bfeat\.|ft\.|featuring|feat/i,
    /\b(xxx|rapper|singer|artist|mc|dj)\b/i,
  ];

  if (lyricsPatterns.some(p => p.test(text))) keywords.push('lyrics');
  if (beatPatterns.some(p => p.test(text))) keywords.push('beat');
  if (artistPatterns.some(p => p.test(text))) keywords.push('rapper');

  return [...new Set(keywords)];
}

async function analyzeImageColors(filePath: string): Promise<{ colors: string[]; saturation: number; brightness: number; colorVariance: number }> {
  try {
    const { data: pixels, info } = await sharp(filePath)
      .resize(100, 100, { fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const r: number[] = [], g: number[] = [], b: number[] = [];
    const step = Math.max(1, Math.floor(pixels.length / (info.width * info.height * 4 / 400)));

    for (let i = 0; i < pixels.length; i += 4 * step) {
      r.push(pixels[i]);
      g.push(pixels[i + 1]);
      b.push(pixels[i + 2]);
    }

    const avg = (arr: number[]) => arr.reduce((a, v) => a + v, 0) / arr.length;
    const std = (arr: number[]) => {
      const m = avg(arr);
      return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
    };

    const avgR = avg(r), avgG = avg(g), avgB = avg(b);
    const avgBrightness = (avgR + avgG + avgB) / 3 / 255;

    // 饱和度: (max - min) / max (对每个像素算再平均)
    let satSum = 0, count = 0;
    for (let i = 0; i < r.length; i++) {
      const maxC = Math.max(r[i], g[i], b[i]);
      const minC = Math.min(r[i], g[i], b[i]);
      satSum += maxC === 0 ? 0 : (maxC - minC) / maxC;
      count++;
    }
    const saturation = satSum / count;

    // 颜色方差：方差大 → 颜色丰富，多彩
    const colorVariance = Math.sqrt(std(r) ** 2 + std(g) ** 2 + std(b) ** 2) / 255;

    return {
      colors: [`rgb(${Math.round(avgR)},${Math.round(avgG)},${Math.round(avgB)})`],
      saturation,
      brightness: avgBrightness,
      colorVariance,
    };
  } catch {
    return { colors: [], saturation: 0, brightness: 0.5, colorVariance: 0 };
  }
}

function inferFeaturesFromColors(
  colors: string[],
  saturation: number,
  brightness: number,
  colorVariance: number
): { hasBeat: boolean; hasPortrait: boolean; hasIllustration: boolean } {
  const result = { hasBeat: false, hasPortrait: false, hasIllustration: false };

  for (const color of colors) {
    const match = color.match(/rgb\((\d+),(\d+),(\d+)\)/);
    if (!match) continue;
    const r = parseInt(match[1]), g = parseInt(match[2]), b = parseInt(match[3]);
    const skinRatio = Math.max(r, g, b) === r && r > 100 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30;

    if (brightness < 0.35 && r > 50 && g > 20 && b < 100) result.hasBeat = true;
    if (skinRatio) result.hasPortrait = true;
  }

  // 涂鸦/插画特征：
  // 1. 高饱和度 (saturation > 0.45) —— 插画色彩鲜艳
  // 2. 中高颜色方差 (colorVariance > 0.25) —— 多种颜色混合
  // 3. 中等亮度 (0.2 < brightness < 0.8) —— 不是纯黑/纯白
  // 4. 非人物主导（排除人像照）
  if (saturation > 0.45 && colorVariance > 0.25 && !result.hasPortrait) {
    result.hasIllustration = true;
  }

  return result;
}

export async function analyzeImage(filePath: string): Promise<ImageAnalysisResult> {
  let ocrText = '';
  let detectedKeywords: string[] = [];
  let hasLyrics = false;
  let hasBeat = false;
  let hasPortrait = false;
  let hasIllustration = false;
  let dominantColors: string[] = [];
  let saturation = 0;
  let brightness = 0.5;

  try {
    // 1. OCR 识别文字（同时支持英文和简体中文）
    const worker = await getWorker();
    const { data: { text } } = await worker.recognize(filePath);
    ocrText = text.trim();

    if (ocrText.length > 2) {
      detectedKeywords = extractRapKeywords(ocrText);
      hasLyrics = detectedKeywords.includes('lyrics');
    }
  } catch (err) {
    console.warn('[ImageAnalyzer] OCR failed:', err);
  }

  try {
    // 2. 颜色/饱和度分析（图片类型推断）
    const colorResult = await analyzeImageColors(filePath);
    dominantColors = colorResult.colors;
    saturation = colorResult.saturation;
    brightness = colorResult.brightness;
    const features = inferFeaturesFromColors(dominantColors, saturation, brightness, colorResult.colorVariance);
    hasBeat = hasBeat || features.hasBeat;
    hasPortrait = features.hasPortrait || false;
    hasIllustration = features.hasIllustration;
  } catch (err) {
    console.warn('[ImageAnalyzer] Color analysis failed:', err);
  }

  return {
    ocrText,
    detectedKeywords,
    hasLyrics,
    hasBeat,
    hasPortrait,
    hasIllustration,
    dominantColors,
    saturation,
    brightness,
  };
}

export async function closeWorker() {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
  }
}
