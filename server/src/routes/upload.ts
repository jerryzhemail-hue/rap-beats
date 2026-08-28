import { Router } from 'express';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth.js';
import { requireUploader } from '../middleware/beatmaker.js';
import { getDatabaseClient } from '../database/client.js';
import { createDirectUploadTarget, saveBuffer, saveText, supportsDirectUpload } from '../services/storage.js';
import { serializeBeatAssets } from '../utils/assets.js';
import { normalizeArtistName } from '../utils/artistNames.js';
import { detectBpmFromBuffer } from '../services/bpmDetector.js';
import type { DatabaseClient } from '../database/client.js';
import { syncBeatmakerStat } from './beats.js';

// 生成默认封面（SVG 格式，纯色背景 + 标题首字母）
function generateDefaultCover(title: string): string {
  const colors = [
    '#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626',
    '#8b5cf6', '#0891b2', '#65a30d', '#ea580c', '#e11d48'
  ];
  const colorIndex = title.charCodeAt(0) % colors.length;
  const bgColor = colors[colorIndex];
  const letter = title.charAt(0).toUpperCase();
  const displayTitle = title.substring(0, 20).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="400" fill="${bgColor}"/>
  <text x="200" y="220" font-family="Arial, sans-serif" font-size="160" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">${letter}</text>
  <text x="200" y="340" font-family="Arial, sans-serif" font-size="24" fill="rgba(255,255,255,0.7)" text-anchor="middle">${displayTitle}</text>
</svg>`;
  return svg;
}

// 取下一个要用的 beat ID：优先填最小空洞（被删除的 ID），没有空洞时取 max+1
async function getNextBeatId(database: DatabaseClient): Promise<number> {
  const row = await database.queryOne<{ next_id: number }>(
    `SELECT next_id FROM (
       SELECT a.id + 1 AS next_id
       FROM beats a
       WHERE NOT EXISTS (SELECT 1 FROM beats b WHERE b.id = a.id + 1)
       ORDER BY next_id ASC
       LIMIT 1
     ) t`
  );
  if (row?.next_id) return row.next_id;
  const max = await database.queryOne<{ max_id: number | null }>('SELECT COALESCE(MAX(id), 0) AS max_id FROM beats');
  return (max?.max_id ?? 0) + 1;
}

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = file.originalname.includes('.') ? file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase() : '';
  if (file.fieldname === 'audio') {
    const allowed = ['.mp3', '.wav', '.flac', '.m4a', '.ogg'];
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的音频格式，请上传 mp3/wav/flac/m4a/ogg'));
    }
  } else if (file.fieldname === 'cover') {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的图片格式，请上传 jpg/png/webp'));
    }
  } else {
    cb(null, false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

const router = Router();

type BeatUploadPayload = {
  title?: string;
  producer?: string;
  rapper?: string;
  genre?: string;
  bpm?: string | number;
  key?: string;
  tags?: string;
  is_free?: string | boolean | number;
  duration?: string | number;
};

function validateBeatUploadPayload(payload: BeatUploadPayload) {
  const { title, producer, genre, rapper, bpm } = payload;
  // 制作人：填写了，或选择了 2 个及以上 rapper（rapper 用 & 分隔）时，可留空
  const rapperCount = rapper && rapper.trim()
    ? rapper.split('&').map(n => n.trim()).filter(n => n).length
    : 0;
  const hasProducer = !!(producer && producer.trim()) || rapperCount >= 2;
  if (!title || !hasProducer || !genre) {
    return '请填写完整信息（标题、风格；制作人必填，除非选择 2 位及以上 Rapper）';
  }

  if (bpm !== undefined && bpm !== null && bpm !== '') {
    const bpmNum = Number(bpm);
    if (isNaN(bpmNum) || bpmNum < 0 || bpmNum > 300) {
      return 'BPM 必须在 0 到 300 之间';
    }
  }

  return null;
}

export async function ensureRapperExists(database: DatabaseClient, name: string): Promise<void> {
  const existing = await database.queryOne<{ id: number }>(
    'SELECT id FROM rappers WHERE name = ?',
    [name]
  );
  
  if (!existing) {
    await database.execute(
      'INSERT INTO rappers (name, avatar_url, bio, sort_order) VALUES (?, NULL, ?, 0)',
      [name, '上传时自动创建']
    );
  }
}

async function createBeatRecord(
  database: DatabaseClient,
  payload: BeatUploadPayload,
  audioPath: string,
  coverImage: string | null,
  uploadedBy: number
) {
  // 解析所有 producer 名字（支持 & 分隔的合作作品）
  const allProducerNames: string[] = [];
  if (payload.producer) {
    if (payload.producer.includes('&')) {
      allProducerNames.push(...payload.producer.split('&').map(n => normalizeArtistName(n.trim())).filter(n => n));
    } else {
      allProducerNames.push(normalizeArtistName(payload.producer.trim()));
    }
  }

  // 解析所有 rapper 名字
  const allRapperNames: string[] = [];
  if (payload.rapper && payload.rapper.trim()) {
    const names = payload.rapper.includes('&')
      ? payload.rapper.split('&').map(n => normalizeArtistName(n.trim())).filter(n => n)
      : [normalizeArtistName(payload.rapper.trim())];
    allRapperNames.push(...names);
  }

  // beats.rapper 字段：优先使用用户填写的 rapper，否则使用 producer
  const rapperNameValue = allRapperNames.length > 0
    ? allRapperNames.join(' & ')
    : (payload.producer?.trim() || null);

  // 频道按制作人(producer)组织；producer 为空时才回退到 rapper
  const namesToEnsure = new Set(allProducerNames.length > 0 ? allProducerNames : allRapperNames);
  for (const name of namesToEnsure) {
    await ensureRapperExists(database, name);
  }

  const nextId = await getNextBeatId(database);

  const result = await database.execute(
    `
      INSERT INTO beats (id, title, producer, rapper, bpm, \`key\`, genre, tags, duration, file_path, cover_image, is_free, download_count, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `,
    [
      nextId,
      payload.title,
      payload.producer,
      rapperNameValue,
      Math.max(0, parseInt(String(payload.bpm ?? 0), 10) || 0),
      payload.key ?? '',
      payload.genre,
      payload.tags || '[]',
      parseInt(String(payload.duration ?? 0), 10) || 0,
      audioPath,
      coverImage,
      payload.is_free === '1' || payload.is_free === 'true' || payload.is_free === true || payload.is_free === 1 ? 1 : 0,
      uploadedBy
    ]
  );

  // 为每个制作人(producer)创建 beat_producers 关联记录
  if (result.insertId) {
    for (const name of namesToEnsure) {
      const rapperRecord = await database.queryOne<{ id: number }>(
        'SELECT id FROM rappers WHERE name = ?',
        [name]
      );
      await database.execute(
        'INSERT INTO beat_producers (beat_id, rapper_id, rapper_name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE rapper_id = COALESCE(rapper_id, VALUES(rapper_id))',
        [result.insertId, rapperRecord?.id || null, name]
      );
    }
    // 同步 beatmaker_profiles.total_beats
    if (uploadedBy) {
      syncBeatmakerStat(uploadedBy, 'total_beats', 1).catch(() => {});
    }
  }

  return result;
}

// POST /api/beats/upload-targets
// OSS 模式下为音频/封面签发直传地址
router.post('/beats/upload-targets', requireUploader, (req: AuthRequest, res) => {
  if (!supportsDirectUpload()) {
    return res.json({ direct_upload: false });
  }

  const { audio, cover } = req.body as {
    audio?: { name?: string; type?: string };
    cover?: { name?: string; type?: string } | null;
  };

  if (!audio?.name) {
    return res.status(400).json({ error: '请提供音频文件信息' });
  }

  const audioTarget = createDirectUploadTarget('audio', {
    originalName: audio.name,
    contentType: audio.type || 'audio/mpeg'
  });
  const coverTarget = cover?.name
    ? createDirectUploadTarget('cover', {
      originalName: cover.name,
      contentType: cover.type || 'image/jpeg'
    })
    : null;

  res.json({
    direct_upload: true,
    audio: audioTarget,
    cover: coverTarget
  });
});

// POST /api/beats/upload
// 需要 Beatmaker 原创制作人认证或管理员身份
// multipart/form-data: audio(必须), cover(可选), title, producer, genre, bpm, tags(逗号分隔), is_free, duration
router.post('/beats/upload', requireUploader, upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'cover', maxCount: 1 }
]), async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files.audio || files.audio.length === 0) {
      return res.status(400).json({ error: '请上传音频文件' });
    }

    const { title, producer, rapper, genre, bpm, key, tags, is_free, duration } = req.body;

    // 验证必填字段
        const validationError = validateBeatUploadPayload({ title, producer, genre, rapper });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const audioFile = files.audio[0];
    const coverFile = files.cover ? files.cover[0] : null;
    const audioAsset = await saveBuffer('audio', {
      buffer: audioFile.buffer,
      originalName: audioFile.originalname
    });

    // 如果用户没有填 BPM / 时长 / 调性，自动从音频中识别
    let detectedBpm: number | null = null;
    let detectedDuration: number | null = null;
    let detectedKey: string | null = null;
    if (!bpm || bpm === '' || !duration || duration === '' || !key || key === '') {
      const bpmResult = await detectBpmFromBuffer(audioFile.buffer, audioFile.originalname);
      if (bpmResult) {
        detectedBpm = Math.round(bpmResult.bpm);
        detectedDuration = Math.round(bpmResult.duration_seconds);
        detectedKey = bpmResult.key || null;
      }
    }

    // 如果没有封面文件，生成默认 SVG 封面
    let coverFilename: string | null = null;
    if (coverFile) {
      coverFilename = (await saveBuffer('cover', {
        buffer: coverFile.buffer,
        originalName: coverFile.originalname
      })).storedValue;
    } else {
      const svg = generateDefaultCover(title);
      coverFilename = (await saveText('cover', svg, {
        extension: '.svg',
        fileNamePrefix: 'default'
      })).storedValue;
    }

    const result = await createBeatRecord(
      database,
      {
        title,
        producer,
        rapper,
        genre,
        // 用户填的值优先；否则用自动识别的值
        bpm: bpm && bpm !== '' ? bpm : (detectedBpm ?? 0),
        key: key && key !== '' ? key : (detectedKey ?? ''),
        duration: duration && duration !== '' ? duration : (detectedDuration ?? 0),
        tags,
        is_free
      },
      audioAsset.storedValue,
      coverFilename,
      req.user!.id
    );

    if (!result.insertId) {
      return res.status(500).json({ error: '上传失败，请稍后重试' });
    }

    const beat = result.insertId
      ? await database.queryOne<Record<string, unknown>>('SELECT * FROM beats WHERE id = ?', [result.insertId])
      : undefined;

    res.status(201).json({
      message: '上传成功',
      beat: beat ? serializeBeatAssets(beat as any) : { id: result.insertId }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '上传失败' });
  }
});

// POST /api/beats/upload-direct
// 直传 OSS 后写入业务数据
router.post('/beats/upload-direct', requireUploader, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  try {
    const { title, producer, rapper, genre, bpm, key, tags, is_free, duration, audio_file_path, cover_image } = req.body as BeatUploadPayload & {
      audio_file_path?: string;
      cover_image?: string | null;
    };

        const validationError = validateBeatUploadPayload({ title, producer, genre, rapper });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    if (!audio_file_path) {
      return res.status(400).json({ error: '缺少音频文件地址' });
    }

    const insertedBeats = [];

    let finalCoverImage = cover_image || null;
    if (!finalCoverImage) {
      const svg = generateDefaultCover(title!);
      finalCoverImage = (await saveText('cover', svg, {
        extension: '.svg',
        fileNamePrefix: 'default'
      })).storedValue;
    }

    // 解析 rapper 名字（用于 beats.rapper 字段）
    const allRapperNames: string[] = [];
    if (rapper && rapper.trim()) {
      const names = rapper.includes('&')
        ? rapper.split('&').map(n => normalizeArtistName(n.trim())).filter(n => n)
        : [normalizeArtistName(rapper.trim())];
      allRapperNames.push(...names);
    } else if (producer && producer.trim()) {
      allRapperNames.push(normalizeArtistName(producer.trim()));
    }

    // 解析 producer 名字（用于频道关联）
    const allProducerNames: string[] = [];
    if (producer && producer.trim()) {
      allProducerNames.push(...producer.split('&').map(n => normalizeArtistName(n.trim())).filter(n => n));
    }

    // 频道按制作人(producer)组织；producer 为空时才回退到 rapper
    const namesToEnsure = new Set(allProducerNames.length > 0 ? allProducerNames : allRapperNames);
    for (const name of namesToEnsure) {
      await ensureRapperExists(database, name);
    }

    // 只创建一个 beat 记录（多制作人/rapper 共享同一个伴奏文件）
    const nextId2 = await getNextBeatId(database);
    const result = await database.execute(
      `
        INSERT INTO beats (id, title, producer, rapper, bpm, \`key\`, genre, tags, duration, file_path, cover_image, is_free, download_count, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `,
      [
        nextId2,
        title,
        producer,
        allRapperNames.length > 0 ? allRapperNames.join(' & ') : producer,
        Math.max(0, parseInt(String(bpm ?? 0), 10) || 0),
        key ?? '',
        genre,
        tags || '[]',
        parseInt(String(duration ?? 0), 10) || 0,
        audio_file_path,
        finalCoverImage,
        is_free === '1' || is_free === 'true' || is_free === true || is_free === 1 ? 1 : 0,
        req.user!.id
      ]
    );

    if (result.insertId) {
      // 为每个制作人(producer)创建 beat_producers 关联记录
      for (const rapperName of namesToEnsure) {
        const rapperRecord = await database.queryOne<{ id: number }>(
          'SELECT id FROM rappers WHERE name = ?',
          [rapperName]
        );
        await database.execute(
          'INSERT INTO beat_producers (beat_id, rapper_id, rapper_name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE rapper_id = COALESCE(rapper_id, VALUES(rapper_id))',
          [result.insertId, rapperRecord?.id || null, rapperName]
        );
      }

      // 同步 beatmaker_profiles.total_beats
      syncBeatmakerStat(req.user!.id, 'total_beats', 1).catch(() => {});

      const beat = await database.queryOne<Record<string, unknown>>('SELECT * FROM beats WHERE id = ?', [result.insertId]);
      if (beat) {
        insertedBeats.push(serializeBeatAssets(beat as any));
      }
    }

    if (insertedBeats.length === 0) {
      return res.status(500).json({ error: '上传失败，请稍后重试' });
    }

    res.status(201).json({
      message: '上传成功',
      beats: insertedBeats
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '上传失败' });
  }
});

// POST /api/beats/detect-bpm — 上传音频后识别 BPM（直接传文件，返回识别结果）
const bpmUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});
router.post('/beats/detect-bpm', requireUploader, bpmUpload.single('audio'), async (req: AuthRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请上传音频文件' });
  }

  try {
    const result = await detectBpmFromBuffer(req.file.buffer, req.file.originalname);
    res.json({
      bpm: result?.bpm ?? null,
      duration: result ? Math.round(result.duration_seconds) : null,
      confidence: result?.confidence ?? null,
      beat_count: result?.beat_count ?? null,
      key: result?.key ?? null,
      key_confidence: result?.key_confidence ?? null,
      error: result ? null : '识别失败'
    });
  } catch (err: any) {
    res.status(422).json({ error: err.message || 'BPM 识别失败' });
  }
});

export default router;
