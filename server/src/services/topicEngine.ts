/**
 * 话题推荐引擎
 * 基于规则 + 关键词匹配，根据帖子内容/标题/图片/音频自动推荐话题标签
 */

import type { ImageAnalysisResult } from './imageAnalyzer.js';
import type { AudioAnalysisResult } from './audioAnalyzer.js';

interface TopicRule {
  keywords: string[];
  weight: number; // 匹配权重
}

// 规则库：关键词 → 话题 slug
const RULES: Record<string, TopicRule> = {
  // 新人报到
  newbie: {
    keywords: ['新人', '第一次', '刚接触', '入门', '初学者', '刚玩', '报到', '注册', 'hello', 'hi', '大家好', '各位好', '初次', '新人报道', '新人报到'],
    weight: 1,
  },

  // 说唱技巧
  technique: {
    keywords: ['技巧', 'flow', '押韵', '韵脚', '韵文', '说唱技巧', '发声', '气息', '腔调', '咬字', '节奏', 'beat', '节奏感', '调', '腔调', '声线', '音准', '音调', '混音', '录制', '录音', '技巧分享', '技巧教学', '教学', '心得', '分享'],
    weight: 1,
  },

  // Beat鉴赏
  'beat-review': {
    keywords: ['beat', 'beat鉴赏', 'beat分享', '伴奏', 'beat推荐', '找beat', '求beat', '用什么beat', 'beat分析', 'beat购买', '买beat', 'beat制作', '编曲', 'beat下载', '免费beat', 'beat免费', 'beat买卖', 'instrumental', 'type beat', 'sample', 'beat评价', 'beat怎么样'],
    weight: 1,
  },

  // 歌词分享
  lyrics: {
    keywords: ['歌词', 'verse', 'hook', '副歌', 'verse1', 'verse2', 'verse3', '歌词分享', 'verse分享', 'verse1', 'verse2', 'verse3', 'hook', 'verse', 'bars', 'lyrics', '写词', '作词', '填词', 'freestyle歌词', '即兴歌词', '歌词求', '歌词求斧', '求词'],
    weight: 1,
  },

  // Freestyle
  freestyle: {
    keywords: ['freestyle', '即兴', 'freestyle battle', 'battle', '即兴说唱', '即兴verse', 'freestyle分享', '即兴battle', 'cypher', 'cypher', 'freestyle练习', '即兴创作', '即兴发挥', 'freestyle对练', '即兴对练', 'freestyle练', '即兴练'],
    weight: 1,
  },

  // 夏日盛夏大作战
  summer: {
    keywords: ['夏天', '盛夏', '暑期', 'Summer', '夏日', '暑假', '夏季', 'hot summer', 'summer vibe', 'summer time'],
    weight: 0.7, // 季节性话题权重稍低
  },

  // 中文说唱
  'chinese-rap': {
    keywords: ['中文说唱', '中文rap', '国语说唱', '华语说唱', '普通话rap', '中国说唱', '国潮', '国风说唱'],
    weight: 1,
  },

  // 海外说唱
  'global-rap': {
    keywords: ['美国说唱', '韩国rap', 'krap', 'khiphop', 'korean rap', 'japanese rap', '日语rap', '韩语说唱', '海外rapper', '外国rapper', 'drake', 'kanye', 'kendrick', 'lamar', 'jayz', 'nas', 'eminem', 'slim', 'shady', 'travis', 'scott', 'jcole', 'lil', 'wayne', 'future', 'migos', 'off', 'topic'],
    weight: 1,
  },

  // 音乐人/歌手推荐
  'rapper-spotlight': {
    keywords: ['rapper推荐', '歌手推荐', '音乐人推荐', '推荐rapper', 'rapper分享', '宝藏rapper', '小众rapper', '新人rapper', 'rapper介绍', '哪位rapper', '谁在说唱', 'rapper是谁'],
    weight: 1,
  },

  // 音乐设备/装备
  'gear': {
    keywords: ['麦克风', '声卡', '耳机', '监听耳机', '录音设备', '设备推荐', '麦克风推荐', '声卡推荐', '用什么麦克风', '设备分享', '录音棚', '家庭录音', 'setup', '设备', '装备', 'mic', 'interface', 'audio interface', 'shure', 'sm7b', 'rode', 'audio-technica', 'at2020'],
    weight: 1,
  },

  // 音乐风格讨论
  'genre-talk': {
    keywords: ['trap', 'old school', 'boombap', 'jazz hip hop', 'lofi', 'lo-fi', 'drill', 'uk drill', 'mumble rap', 'gangsta rap', 'conscious rap', 'melodic rap', 'emo rap', 'cloud rap', 'phonk', 'southside', 'DirtySouth', 'east coast', 'west coast', 'gangsta', 'g-funk', 'boom bap', 'oldschool', 'new school', 'gangster rap', '风格', '风格讨论', '曲风', 'trap beat', 'old school beat'],
    weight: 1,
  },

  // 比赛/活动
  'competition': {
    keywords: ['比赛', 'battle比赛', '比赛报名', '活动', '赛事', '海选', '决赛', '报名', '参赛', '拿冠军', '比赛结果', 'battle大会', '说唱比赛', 'rap battle', 'rap contest', 'cypher比赛', 'freestyle比赛', '比赛视频'],
    weight: 1,
  },

  // 音乐评论/争议
  'controversy': {
    keywords: ['diss', '回应diss', 'diss track', 'dissback', 'beef', 'beef来了', 'diss曲', '争议', '事件', '风波', '节奏', '八卦', '黑料', '吃瓜', '吐槽', '撕', '互呛'],
    weight: 1,
  },

  // 创作求助
  'help': {
    keywords: ['求', '求助', '帮忙', '不会', '不懂', '新手', '求指导', '怎么写', '怎么练', '怎么录', '怎么调', '怎么混', '怎么唱', '请教', '求教', '问问', '提问', '请教一下', '求助帖'],
    weight: 0.8,
  },

  // 心情/情感
  'emotion': {
    keywords: ['心情', 'emo', '难过', '开心', '快乐', '抑郁', '焦虑', '孤独', '失恋', '分手', '难过', '压抑', '治愈', '治愈系', '情感', '情感说唱', 'real talk', 'story', '故事', '经历', '自己的故事', '真实故事', '心路历程'],
    weight: 1,
  },

  // 涂鸦/插画
  'graffiti': {
    keywords: ['graffiti', '涂鸦', 'street art', '壁画', '插画', 'illustration', 'drawing', 'sketch', 'art', '涂鸦分享', '插画分享', '画画', '画作'],
    weight: 1,
  },
};

// 各版块允许的话题 slug 集合（用于过滤推荐结果）
const CATEGORY_VALID_SLUGS: Record<number, string[]> = {
  2: ['lyrics', 'freestyle', 'technique', 'beat-review'], // 创作
  3: ['beat-review', 'beat-production'],          // 免费Beat分享
  5: ['newbie'],                                   // 新人报道
  7: ['rap-battle', 'battle-analysis', 'performance'], // 说唱巅峰对决2026
  8: ['graffiti', 'street-art', 'illustration'],   // 涂鸦
  9: ['hit-song', 'classic-tracks'],                // 说唱 HIT-SONG
  10: ['technique', 'lyrics', 'beat-review', 'genre-talk', 'chinese-rap', 'emotion'], // 说唱
};

export const DEFAULT_TOPICS: Array<{ id: number; name: string; slug: string; category_id: number; post_count: number }> = [
  // 创作 (cat 2)
  { id: 0, name: '说唱技巧', slug: 'technique', category_id: 2, post_count: 0 },
  { id: 0, name: 'Beat鉴赏', slug: 'beat-review', category_id: 2, post_count: 0 },
  { id: 0, name: '歌词分享', slug: 'lyrics', category_id: 2, post_count: 0 },
  { id: 0, name: 'Freestyle', slug: 'freestyle', category_id: 2, post_count: 0 },
  // 免费Beat分享 (cat 3)
  { id: 0, name: 'Beat鉴赏', slug: 'beat-review', category_id: 3, post_count: 0 },
  { id: 0, name: 'Beat制作', slug: 'beat-production', category_id: 3, post_count: 0 },
  // 新人报道 (cat 5)
  { id: 0, name: '新人报到', slug: 'newbie', category_id: 5, post_count: 0 },
  // 说唱巅峰对决2026 (cat 7)
  { id: 0, name: '选手讨论', slug: 'rap-battle', category_id: 7, post_count: 0 },
  { id: 0, name: '对决解析', slug: 'battle-analysis', category_id: 7, post_count: 0 },
  { id: 0, name: '舞台表现', slug: 'performance', category_id: 7, post_count: 0 },
  // 涂鸦 (cat 8)
  { id: 0, name: '涂鸦插画', slug: 'graffiti', category_id: 8, post_count: 0 },
  { id: 0, name: '街头艺术', slug: 'street-art', category_id: 8, post_count: 0 },
  { id: 0, name: '插画分享', slug: 'illustration', category_id: 8, post_count: 0 },
  // 说唱 HIT-SONG (cat 9)
  { id: 0, name: 'HIT-SONG赏析', slug: 'hit-song', category_id: 9, post_count: 0 },
  { id: 0, name: '经典曲目', slug: 'classic-tracks', category_id: 9, post_count: 0 },
  // 说唱 (cat 10)
  { id: 0, name: '音乐风格', slug: 'genre-talk', category_id: 10, post_count: 0 },
  { id: 0, name: '中文说唱', slug: 'chinese-rap', category_id: 10, post_count: 0 },
  { id: 0, name: '情感说唱', slug: 'emotion', category_id: 10, post_count: 0 },
  { id: 0, name: '歌词分享', slug: 'lyrics', category_id: 10, post_count: 0 },
  { id: 0, name: 'Beat鉴赏', slug: 'beat-review', category_id: 10, post_count: 0 },
  { id: 0, name: '说唱技巧', slug: 'technique', category_id: 10, post_count: 0 },
];

export interface TopicSuggestion {
  slug: string;
  category_id: number;
  score: number;
  matchedKeywords: string[];
  source: 'text' | 'image' | 'both';
}

export function suggestTopics(
  text: string,
  categoryId: number,
  imageAnalysis?: ImageAnalysisResult,
  audioAnalysis?: AudioAnalysisResult,
  existingTopicIds: number[] = []
): TopicSuggestion[] {
  if (!text.trim() && !imageAnalysis && !audioAnalysis) return [];

  const validSlugs = CATEGORY_VALID_SLUGS[categoryId] ?? [];
  const scores: Map<string, { score: number; matchedKeywords: string[]; source: 'text' | 'image' | 'both' }> = new Map();

  // ── 文本匹配 ──
  if (text.trim().length >= 2) {
    const normalized = text.toLowerCase();

    for (const [slug, rule] of Object.entries(RULES)) {
      let matchCount = 0;
      const matchedKeywords: string[] = [];

      for (const keyword of rule.keywords) {
        if (normalized.includes(keyword.toLowerCase())) {
          matchCount++;
          matchedKeywords.push(keyword);
        }
      }

      if (matchCount > 0) {
        const score = matchCount * rule.weight + matchedKeywords.length * 0.5;
        const existing = scores.get(slug);
        if (!existing || existing.score < score) {
          scores.set(slug, { score, matchedKeywords, source: 'text' });
        }
      }
    }
  }

  // ── 图片特征匹配 ──
  if (imageAnalysis) {
    // 关键词特征
    for (const kw of imageAnalysis.detectedKeywords) {
      const slug = kw; // ocrKeywords 中的 key 同时也是 slug
      const rule = RULES[slug];
      if (!rule) continue;

      const existing = scores.get(slug);
      const imgScore = rule.weight * 3; // 图片匹配加权更高
      if (!existing || existing.score < imgScore) {
        scores.set(slug, { score: imgScore, matchedKeywords: [`[图片]${kw}`], source: 'image' });
      }
    }

    // 视觉特征推断
    if (imageAnalysis.hasLyrics) {
      const rule = RULES['lyrics'];
      if (rule) {
        const existing = scores.get('lyrics');
        const imgScore = rule.weight * 4;
        if (!existing || existing.score < imgScore) {
          scores.set('lyrics', { score: imgScore, matchedKeywords: ['[图片]歌词识别'], source: 'image' });
        }
      }
    }

    // 涂鸦/插画特征推断
    if (imageAnalysis.hasIllustration) {
      const rule = RULES['graffiti'];
      if (rule) {
        const existing = scores.get('graffiti');
        const imgScore = rule.weight * 4;
        if (!existing || existing.score < imgScore) {
          scores.set('graffiti', {
            score: imgScore,
            matchedKeywords: [`[图片]饱和度${(imageAnalysis.saturation * 100).toFixed(0)}%多彩`],
            source: 'image',
          });
        }
      }
    }
  }

  // ── 音频特征匹配 ──
  if (audioAnalysis) {
    // 从检测到的风格 slug 映射到话题
    for (const slug of audioAnalysis.detectedStyle) {
      const rule = RULES[slug];
      if (!rule) continue;
      const existing = scores.get(slug);
      const audioScore = rule.weight * 4;
      if (!existing || existing.score < audioScore) {
        scores.set(slug, {
          score: audioScore,
          matchedKeywords: [`[音频]${audioAnalysis.detectedStyle.join('/')}`],
          source: 'image',
        });
      }
    }

    // 从 BPM 范围推断 Trap/Drill
    if (audioAnalysis.bpm) {
      if (audioAnalysis.bpm >= 60 && audioAnalysis.bpm <= 90) {
        const rule = RULES['genre-talk'];
        if (rule) {
          const existing = scores.get('genre-talk');
          const bpmScore = 3;
          if (!existing || existing.score < bpmScore) {
            scores.set('genre-talk', {
              score: bpmScore,
              matchedKeywords: [`[音频]BPM ${audioAnalysis.bpm} (Trap/Dark)`],
              source: 'image',
            });
          }
        }
      } else if (audioAnalysis.bpm >= 140 && audioAnalysis.bpm <= 160) {
        const rule = RULES['genre-talk'];
        if (rule) {
          const existing = scores.get('genre-talk');
          const bpmScore = 4;
          if (!existing || existing.score < bpmScore) {
            scores.set('genre-talk', {
              score: bpmScore,
              matchedKeywords: [`[音频]BPM ${audioAnalysis.bpm} (Drill/Fast)`],
              source: 'image',
            });
          }
        }
      }
    }
  }

  // 合并分数：同时被文本和图片匹配的话题分数叠加
  const merged = new Map<string, { score: number; matchedKeywords: string[]; source: 'text' | 'image' | 'both' }>();
  for (const [slug, entry] of scores) {
    const existing = merged.get(slug);
    if (existing) {
      merged.set(slug, {
        score: existing.score + entry.score,
        matchedKeywords: [...new Set([...existing.matchedKeywords, ...entry.matchedKeywords])],
        source: 'both',
      });
    } else {
      merged.set(slug, entry);
    }
  }

  // 按分数排序，取 top 3（仅限当前版块的话题）
  const sorted = Array.from(merged.entries())
    .filter(([slug]) => validSlugs.includes(slug))
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 3);

  return sorted.map(([slug, { score, matchedKeywords, source }]) => {
    return {
      slug,
      category_id: categoryId,
      score: Math.round(score * 10) / 10,
      matchedKeywords,
      source,
    };
  });
}
