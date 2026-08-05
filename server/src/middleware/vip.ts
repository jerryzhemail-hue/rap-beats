import { AuthRequest } from './auth.js';
import { getDatabaseClient } from '../database/client.js';
import { getLocalDateString } from '../utils/timezone.js';

export type VipLevel = 'free' | 'basic' | 'premium' | 'ultimate';
export const FREE_PREVIEW_DURATION_SECONDS = 40;
export const FREE_PREVIEW_MAX_BYTES = 960 * 1024;
export const FREE_PREVIEW_TRACK_LIMIT = 6;
export const ANONYMOUS_USER_ID = 4; // 匿名用户 ID，用于未登录用户试听记录

// 懒加载缓存：启动时为 null，首次访问时校验并存入，若校验失败则后续所有匿名试听操作静默跳过
let _anonymousUserId: number | null = null;

async function resolveAnonymousUserId(): Promise<number | null> {
  if (_anonymousUserId !== null) return _anonymousUserId;
  try {
    const db = getDatabaseClient();
    const row = await db.queryOne<{ id: number }>('SELECT id FROM users WHERE id = ?', [ANONYMOUS_USER_ID]);
    _anonymousUserId = row?.id ?? null;
  } catch {
    _anonymousUserId = null;
  }
  return _anonymousUserId;
}

// 多实例部署注意：VIP_CACHE_ENABLED=false 时会跳过进程内缓存，每次请求查 DB。
// 推荐使用 Redis 等共享缓存替代进程内 Map，实现跨进程实时失效。
const VIP_CACHE_ENABLED = process.env.VIP_CACHE_ENABLED !== 'false';
const VIP_CACHE_TTL_MS = 60 * 1000; // 60s，多实例部署时可缩短此值

type VipCacheEntry = {
  level: VipLevel;
  expiresAt: number; // timestamp when this cache entry expires
};

const vipCache = new Map<number, VipCacheEntry>();

function evictExpiredCache(userId: number, now: number): void {
  const entry = vipCache.get(userId);
  if (entry && entry.expiresAt <= now) {
    vipCache.delete(userId);
  }
}

function getCachedVipLevel(userId: number): VipLevel | null {
  if (!VIP_CACHE_ENABLED) return null;
  const now = Date.now();
  evictExpiredCache(userId, now);
  const entry = vipCache.get(userId);
  return entry ? entry.level : null;
}

function setCachedVipLevel(userId: number, level: VipLevel): void {
  if (!VIP_CACHE_ENABLED) return;
  vipCache.set(userId, {
    level,
    expiresAt: Date.now() + VIP_CACHE_TTL_MS
  });
}

export function invalidateVipCache(userId: number): void {
  vipCache.delete(userId);
}

type VipSnapshot = {
  role?: string | null;
  vip_level?: string | null;
  vip_expire_at?: string | null;
};

function normalizeVipLevel(level: string | null | undefined): VipLevel {
  if (level === 'basic' || level === 'premium' || level === 'ultimate') {
    return level;
  }
  return 'free';
}

export function getEffectiveVipLevel(user: VipSnapshot | null | undefined): VipLevel {
  if (user?.role === 'admin') {
    return 'ultimate';
  }
  return normalizeVipLevel(user?.vip_level);
}

export async function getUserVipLevel(req: AuthRequest): Promise<VipLevel> {
  if (!req.user) return 'free';
  const userId = req.user.id;

  // Admin always gets ultimate without DB check
  if (req.user.role === 'admin') return 'ultimate';

  // Try cache first
  const cached = getCachedVipLevel(userId);
  if (cached !== null) return cached;

  const database = getDatabaseClient();
  const user = await database.queryOne<{ role: string | null; vip_level: string | null; vip_expire_at: string | null }>(
    'SELECT role, vip_level, vip_expire_at FROM users WHERE id = ?',
    [userId]
  );
  if (!user) return 'free';

  const level = getEffectiveVipLevel(user);
  if (level === 'free') {
    setCachedVipLevel(userId, 'free');
    return 'free';
  }

  // Check expiration
  if (user.vip_expire_at && new Date(user.vip_expire_at) < new Date()) {
    await database.execute("UPDATE users SET vip_level = 'free' WHERE id = ?", [userId]);
    setCachedVipLevel(userId, 'free');
    return 'free';
  }

  setCachedVipLevel(userId, level);
  return level;
}

export function getDailyDownloadLimit(level: VipLevel): number | null {
  switch (level) {
    case 'free': return 5; // 免费用户每天最多下载 5 次（经积分兑换权限，同样计入）
    case 'basic': return 10;
    case 'premium': return 30;
    case 'ultimate': return null; // 无限
  }
}

export function canAccessVipContent(level: VipLevel): boolean {
  return level === 'premium' || level === 'ultimate';
}

export function canAccessHighQuality(level: VipLevel): boolean {
  return level === 'premium' || level === 'ultimate';
}

export function canFullPreview(level: VipLevel): boolean {
  return level !== 'free';
}

export function getDailyPreviewTrackLimit(level: VipLevel): number | null {
  // 免费用户不限制试听次数（但后端仍限制60秒预览）
  return null;
}

export function canDownload(level: VipLevel): boolean {
  return level !== 'free';
}

// 保留向后兼容
export async function checkVipStatus(req: AuthRequest): Promise<boolean> {
  return (await getUserVipLevel(req)) !== 'free';
}

export async function getDailyDownloadCount(userId: number): Promise<number> {
  // 统一使用本地时区
  const today = getLocalDateString();
  const database = getDatabaseClient();
  const result = await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM downloads WHERE user_id = ? AND created_at >= ?',
    [userId, today + ' 00:00:00']
  );
  return result?.count ?? 0;
}

export async function getDailyPreviewTrackCount(userId: number): Promise<number> {
  // 统一使用本地时区
  const today = getLocalDateString();
  const database = getDatabaseClient();
  const result = await database.queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM preview_history WHERE user_id = ? AND preview_date = ?',
    [userId, today]
  );
  return result?.count ?? 0;
}

export async function hasPreviewedBeatToday(userId: number, beatId: number): Promise<boolean> {
  // 统一使用本地时区
  const today = getLocalDateString();
  const database = getDatabaseClient();
  const result = await database.queryOne<{ id: number }>(
    'SELECT id FROM preview_history WHERE user_id = ? AND beat_id = ? AND preview_date = ? LIMIT 1',
    [userId, beatId, today]
  );
  return Boolean(result);
}

export async function recordPreviewAccess(
  userId: number,
  beatId: number,
  deviceId?: string,
  ipAddress?: string
): Promise<void> {
  const today = getLocalDateString();
  const database = getDatabaseClient();

  // deviceId/ipAddress 仅用于未登录用户（匿名用户）
  if (deviceId && (userId === 0 || userId === ANONYMOUS_USER_ID)) {
    const anonId = await resolveAnonymousUserId();
    if (anonId === null) return; // 匿名用户记录不存在，静默跳过
    await database.execute(
      `INSERT INTO preview_history (user_id, beat_id, preview_date, device_id, ip_address)
       VALUES (?, ?, ?, ?, ?)`,
      [anonId, beatId, today, deviceId, ipAddress || null]
    );
    return;
  }

  await database.execute(
    'INSERT INTO preview_history (user_id, beat_id, preview_date) VALUES (?, ?, ?)',
    [userId, beatId, today]
  );
}

// 获取游客当日试听次数（按 sessionId + IP 双key）
export async function getGuestTodayPreviewCount(sessionId: string, ipAddress: string): Promise<number> {
  const today = getLocalDateString();
  const database = getDatabaseClient();
  const anonId = await resolveAnonymousUserId();
  if (anonId === null) return 0; // 匿名用户记录不存在，视为 0 次
  const result = await database.queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM preview_history
     WHERE device_id = ? AND ip_address = ? AND preview_date = ? AND user_id = ?`,
    [sessionId, ipAddress, today, anonId]
  );
  return result?.count ?? 0;
}

export const GUEST_PREVIEW_LIMIT = 3;
const ANONYMOUS_SESSION_COOKIE = 'rap_session';

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((pair) => {
    const [key, ...val] = pair.trim().split('=');
    if (key && val.length > 0) cookies[key.trim()] = val.join('=');
  });
  return cookies;
}

/**
 * 从请求中提取游客 session ID（来自 rap_session cookie）。
 * 如果 cookie 不存在则返回 null（不自动创建，保持无状态）。
 */
export function extractGuestSessionId(req: import('express').Request): string | null {
  const cookieHeader = req.headers.cookie;
  const cookies = parseCookies(cookieHeader);
  return cookies[ANONYMOUS_SESSION_COOKIE] || null;
}
