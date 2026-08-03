import { Router } from 'express';
import multer from 'multer';
import { requireAdmin, type AuthRequest } from '../middleware/auth.js';
import { getDatabaseClient } from '../database/client.js';
import {
  createDirectUploadTarget,
  deleteStoredAsset,
  saveBuffer,
  supportsDirectUpload
} from '../services/storage.js';
import { serializeBannerAssets } from '../utils/assets.js';

const router = Router();

const bannerUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = file.originalname.includes('.') ? file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase() : '';
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Banner 图仅支持 jpg、png、webp 格式'));
    }
  }
});

type BannerPayload = {
  name?: string;
  image_url?: string;
  link_url?: string | null;
  sort_order?: number | string;
  is_active?: boolean | number | string;
  overlay_opacity?: number | string;
  display_duration?: number | string;
};

type BannerRow = {
  id: number;
  name: string;
  image_url: string;
  link_url: string | null;
  sort_order: number;
  is_active: number | boolean;
  overlay_opacity: number;
  display_duration: number;
  created_at: string;
  updated_at: string;
};

type BannerReorderItem = {
  id?: number;
  sort_order?: number;
};

function toBannerResponse(row: BannerRow) {
  const serialized = serializeBannerAssets(row);
  return {
    ...serialized,
    image_value: row.image_url,
    sort_order: Number(row.sort_order ?? 0),
    is_active: Boolean(Number(row.is_active)),
    overlay_opacity: Number(row.overlay_opacity ?? 45),
    display_duration: Number(row.display_duration ?? 5)
  };
}

function parseBoolean(value: BannerPayload['is_active']): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

function normalizeBannerPayload(payload: BannerPayload, options: { requireImage?: boolean } = {}) {
  const hasImageField = Object.prototype.hasOwnProperty.call(payload, 'image_url');
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const imageUrl = typeof payload.image_url === 'string' ? payload.image_url.trim() : '';
  const linkUrl = typeof payload.link_url === 'string' ? payload.link_url.trim() : '';
  const sortOrder = Number(payload.sort_order ?? 0);
  const overlayOpacity = Number(payload.overlay_opacity ?? 45);
  const displayDuration = Number(payload.display_duration ?? 5);

  if (!name) {
    return { error: '请填写 Banner 名称' };
  }

  if (options.requireImage && !imageUrl) {
    return { error: '请先上传 Banner 背景图' };
  }

  return {
    data: {
      name,
      image_url: hasImageField ? (imageUrl || null) : undefined,
      link_url: linkUrl || null,
      sort_order: Number.isFinite(sortOrder) ? clampInteger(sortOrder, 0, 999) : 0,
      is_active: parseBoolean(payload.is_active),
      overlay_opacity: Number.isFinite(overlayOpacity) ? clampInteger(overlayOpacity, 0, 90) : 45,
      display_duration: Number.isFinite(displayDuration) ? clampInteger(displayDuration, 2, 15) : 5
    }
  };
}

router.get('/banners', async (_req, res) => {
  const database = getDatabaseClient();
  const banners = await database.queryMany<BannerRow>(
    `
      SELECT id, name, image_url, link_url, sort_order, is_active, overlay_opacity, display_duration, created_at, updated_at
      FROM banners
      WHERE is_active = 1
      ORDER BY sort_order ASC, id DESC
    `
  );

  res.json({ banners: banners.map(toBannerResponse) });
});

router.get('/admin/banners', requireAdmin, async (_req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const banners = await database.queryMany<BannerRow>(
    `
      SELECT id, name, image_url, link_url, sort_order, is_active, overlay_opacity, display_duration, created_at, updated_at
      FROM banners
      ORDER BY sort_order ASC, id DESC
    `
  );

  res.json({ banners: banners.map(toBannerResponse) });
});

router.post('/admin/banners/upload-target', requireAdmin, (req: AuthRequest, res) => {
  if (!supportsDirectUpload()) {
    return res.json({ direct_upload: false });
  }

  const { file } = req.body as { file?: { name?: string; type?: string } };
  if (!file?.name) {
    return res.status(400).json({ error: '请提供 Banner 图片信息' });
  }

  const target = createDirectUploadTarget('banner', {
    originalName: file.name,
    contentType: file.type || 'image/jpeg'
  });

  res.json({
    direct_upload: true,
    target
  });
});

router.post('/admin/banners/upload-image', requireAdmin, bannerUpload.single('image'), async (req: AuthRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择 Banner 图片' });
  }

  const asset = await saveBuffer('banner', {
    buffer: req.file.buffer,
    originalName: req.file.originalname
  });

  res.json({
    message: 'Banner 图片上传成功',
    stored_value: asset.storedValue,
    image_url: serializeBannerAssets({ image_url: asset.storedValue }).image_url
  });
});

router.post('/admin/banners', requireAdmin, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const normalized = normalizeBannerPayload(req.body as BannerPayload, { requireImage: true });
  if ('error' in normalized) {
    return res.status(400).json({ error: normalized.error });
  }

  const { name, image_url, link_url, sort_order, is_active, overlay_opacity, display_duration } = normalized.data;
  const result = await database.execute(
    `
      INSERT INTO banners (name, image_url, link_url, sort_order, is_active, overlay_opacity, display_duration)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [name, image_url, link_url, sort_order, is_active ? 1 : 0, overlay_opacity, display_duration]
  );

  const banner = result.insertId
    ? await database.queryOne<BannerRow>(
        `
          SELECT id, name, image_url, link_url, sort_order, is_active, overlay_opacity, display_duration, created_at, updated_at
          FROM banners
          WHERE id = ?
        `,
        [result.insertId]
      )
    : null;

  res.status(201).json({
    message: 'Banner 创建成功',
    banner: banner ? toBannerResponse(banner) : { id: result.insertId }
  });
});

router.post('/admin/banners/reorder', requireAdmin, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const items = Array.isArray((req.body as { items?: BannerReorderItem[] }).items)
    ? ((req.body as { items: BannerReorderItem[] }).items)
    : [];

  if (items.length === 0) {
    return res.status(400).json({ error: '缺少排序数据' });
  }

  const normalized = items.map((item, index) => ({
    id: Number(item.id),
    sort_order: Number.isFinite(Number(item.sort_order)) ? clampInteger(Number(item.sort_order), 0, 999) : index
  }));

  if (normalized.some((item) => !Number.isInteger(item.id) || item.id <= 0)) {
    return res.status(400).json({ error: '存在无效的 Banner ID' });
  }

  await database.transaction(async (tx) => {
    for (const item of normalized) {
      await tx.execute('UPDATE banners SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
        item.sort_order,
        item.id
      ]);
    }
  });

  res.json({ message: 'Banner 排序已更新' });
});

router.put('/admin/banners/:id', requireAdmin, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const bannerParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const bannerId = parseInt(bannerParam, 10);
  const existing = await database.queryOne<BannerRow>(
    `
      SELECT id, name, image_url, link_url, sort_order, is_active, overlay_opacity, display_duration, created_at, updated_at
      FROM banners
      WHERE id = ?
    `,
    [bannerId]
  );

  if (!existing) {
    return res.status(404).json({ error: 'Banner 不存在' });
  }

  const normalized = normalizeBannerPayload(req.body as BannerPayload);
  if ('error' in normalized) {
    return res.status(400).json({ error: normalized.error });
  }

  const nextImageUrl = normalized.data.image_url === undefined ? existing.image_url : normalized.data.image_url;
  if (!nextImageUrl) {
    return res.status(400).json({ error: '请先上传 Banner 背景图' });
  }

  await database.execute(
    `
      UPDATE banners
      SET name = ?, image_url = ?, link_url = ?, sort_order = ?, is_active = ?, overlay_opacity = ?, display_duration = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      normalized.data.name,
      nextImageUrl,
      normalized.data.link_url,
      normalized.data.sort_order,
      normalized.data.is_active ? 1 : 0,
      normalized.data.overlay_opacity,
      normalized.data.display_duration,
      bannerId
    ]
  );

  if (existing.image_url && nextImageUrl !== existing.image_url) {
    await deleteStoredAsset('banner', existing.image_url);
  }

  const updated = await database.queryOne<BannerRow>(
    `
      SELECT id, name, image_url, link_url, sort_order, is_active, overlay_opacity, display_duration, created_at, updated_at
      FROM banners
      WHERE id = ?
    `,
    [bannerId]
  );

  res.json({
    message: 'Banner 更新成功',
    banner: updated ? toBannerResponse(updated) : null
  });
});

router.delete('/admin/banners/:id', requireAdmin, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const bannerParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const bannerId = parseInt(bannerParam, 10);
  const existing = await database.queryOne<BannerRow>('SELECT id, image_url FROM banners WHERE id = ?', [bannerId]);

  if (!existing) {
    return res.status(404).json({ error: 'Banner 不存在' });
  }

  await database.execute('DELETE FROM banners WHERE id = ?', [bannerId]);
  await deleteStoredAsset('banner', existing.image_url);

  res.json({ message: 'Banner 已删除' });
});

export default router;
