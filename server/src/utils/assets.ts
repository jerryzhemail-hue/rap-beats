import { getSignedAssetUrl } from '../services/storage.js';

const IMAGE_URL_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;

type MaybeUserWithAvatar = {
  avatar_url?: string | null;
};

type MaybeBeatWithCover = {
  cover_image?: string | null;
  tags?: unknown;
};

type MaybeBannerWithImage = {
  image_url?: string | null;
};

/**
 * 把 beats.tags 列的 JSON 字符串解析成 string[]，并对脏数据兜底：
 *  - null / undefined / '' / '[]' → []
 *  - 合法 JSON 数组 → 数组
 *  - 非法 JSON → []（不抛异常）
 *  - 已经是数组（MySQL JSON 类型或上游已 parse）→ 原样返回
 */
function normalizeTags(tags: unknown): string[] {
  if (tags == null) return [];
  if (Array.isArray(tags)) return tags as string[];
  if (typeof tags !== 'string') return [];
  const trimmed = tags.trim();
  if (!trimmed || trimmed === '[]') return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.filter((t) => typeof t === 'string');
    return [];
  } catch {
    return [];
  }
}

export function serializeUserAssets<T extends MaybeUserWithAvatar>(user: T): T {
  return {
    ...user,
    avatar_url: getSignedAssetUrl('avatar', user.avatar_url, {
      expiresInSeconds: IMAGE_URL_EXPIRES_IN_SECONDS
    })
  };
}

export function serializeBeatAssets<T extends MaybeBeatWithCover>(beat: T): T {
  return {
    ...beat,
    cover_image: getSignedAssetUrl('cover', beat.cover_image, {
      expiresInSeconds: IMAGE_URL_EXPIRES_IN_SECONDS
    }),
    tags: normalizeTags(beat.tags)
  };
}

export function serializeBannerAssets<T extends MaybeBannerWithImage>(banner: T): T {
  return {
    ...banner,
    image_url: getSignedAssetUrl('banner', banner.image_url, {
      expiresInSeconds: IMAGE_URL_EXPIRES_IN_SECONDS
    })
  };
}
