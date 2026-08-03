/**
 * 音频内容分析服务
 * 解析音频文件的元数据、BPM、声道等特征，辅助话题推荐
 */

import * as mm from 'music-metadata';

export interface AudioAnalysisResult {
  bpm: number | null;
  duration: number | null;
  genre: string[];
  format: string;
  detectedStyle: string[]; // 识别出的风格标签
}

const BPM_RANGES: Record<string, { min: number; max: number; slug: string; label: string }> = {
  trap: { min: 60, max: 90, slug: 'trap', label: 'Trap' },
  boomBap: { min: 85, max: 105, slug: 'genre-talk', label: 'BoomBap' },
  drill: { min: 140, max: 160, slug: 'genre-talk', label: 'Drill' },
  hyperpop: { min: 160, max: 220, slug: 'genre-talk', label: 'Hyperpop' },
};

const FORMAT_STYLE_MAP: Record<string, string[]> = {
  'audio/mpeg': ['mp3', 'standard'],
  'audio/wav': ['wav', 'high-quality'],
  'audio/aac': ['aac', 'modern'],
  'audio/flac': ['flac', 'lossless'],
};

const KEYWORDS_FROM_TITLE: Array<{ pattern: RegExp; slug: string; label: string }> = [
  // 风格关键词
  { pattern: /\b(trap|drill|phonk|boombap|boom\s*bap|old\s*school|old\s*school|oldschool|new\s*school|gangsta|emo rap|melodic rap|cloud rap|mumble rap|conscious rap|jazz hip hop|lofi|lo-fi|lofi)\b/gi, slug: 'genre-talk', label: '音乐风格' },
  // 情绪/氛围关键词
  { pattern: /\b(sad|emo|mood|dark|dark vibe|night|nighttime|chill|relax|study|sleep|heal|healing|lofi|lo-fi|chill vibes|sad vibes|dark rap)\b/gi, slug: 'emotion', label: '情感说唱' },
  // 角色关键词
  { pattern: /\b(type beat|drake type|kanye type|eminem type|jcole type|travis type|lil uzi|lil tecca|lil baby|lil durk|gunna|future|kendrick|cole)\b/gi, slug: 'genre-talk', label: '风格模仿' },
  // 用途关键词
  { pattern: /\b(freestyle|battle|cypher|freestyle beat|practice|练歌|即兴伴奏)\b/gi, slug: 'freestyle', label: 'Freestyle' },
  // 制作关键词
  { pattern: /\b(produced by|prod\.|production by|beat by|instrumental|original beat|exclusive|买断|独家)\b/gi, slug: 'beat-review', label: 'Beat制作' },
];

export async function detectAudioFeature(filePath: string): Promise<AudioAnalysisResult> {
  let bpm: number | null = null;
  let duration: number | null = null;
  let genre: string[] = [];
  let format = 'unknown';
  const detectedStyle: string[] = [];

  try {
    const metadata = await mm.parseFile(filePath);

    duration = metadata.format.duration ?? null;

    // 尝试从 commonTags 拿 BPM（有些文件有）
    const common = metadata.common;
    if (common.bpm) bpm = common.bpm;

    if (common.genre && common.genre.length > 0) {
      genre = common.genre;
    }

    const mimeType = metadata.format.container;
    if (mimeType && !mimeType.includes('/')) format = mimeType;
  } catch (err) {
    console.warn('[AudioAnalyzer] music-metadata failed:', err);
  }

  // 从文件名推断风格（很多 Beat 文件名会包含风格信息）
  const fileName = filePath.split('/').pop() ?? '';
  const normalizedFileName = fileName.toLowerCase().replace(/[_\-\s\.]/g, ' ');

  for (const item of KEYWORDS_FROM_TITLE) {
    if (item.pattern.test(normalizedFileName)) {
      if (!detectedStyle.includes(item.slug)) {
        detectedStyle.push(item.slug);
      }
    }
  }

  // 从 BPM 推断风格
  if (bpm) {
    for (const [, config] of Object.entries(BPM_RANGES)) {
      if (bpm >= config.min && bpm <= config.max) {
        if (!detectedStyle.includes(config.slug)) {
          detectedStyle.push(config.slug);
        }
      }
    }
  }

  return { bpm, duration, genre, format, detectedStyle };
}
