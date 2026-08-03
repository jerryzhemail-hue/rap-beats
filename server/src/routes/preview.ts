import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { optionalAuth, AuthRequest } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { getUserVipLevel, canFullPreview, ANONYMOUS_USER_ID, getGuestTodayPreviewCount, extractGuestSessionId, GUEST_PREVIEW_LIMIT, recordPreviewAccess } from '../middleware/vip.js';

const router = Router();

const previewPlayLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  message: '播放事件发送过于频繁，请稍后再试',
});

const ANONYMOUS_SESSION_COOKIE = 'rap_session';
const SESSION_EXPIRY_DAYS = 30;

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return String(forwarded[0]).split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

// 生成匿名 session ID（服务端控制，无需前端参与）
function generateSessionId(): string {
  return crypto.randomBytes(24).toString('base64url');
}

// 获取或创建匿名 session ID（从 Cookie 中读取或自动设置）
function getOrCreateAnonymousSessionId(req: Request, res: Response): string {
  const cookies: Record<string, string> = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach((pair) => {
      const [key, ...val] = pair.trim().split('=');
      if (key && val.length > 0) {
        cookies[key.trim()] = val.join('=');
      }
    });
  }

  let sessionId = cookies[ANONYMOUS_SESSION_COOKIE];

  if (!sessionId) {
    sessionId = generateSessionId();
    const maxAge = SESSION_EXPIRY_DAYS * 24 * 60 * 60;
    // 生产环境（HTTPS）添加 Secure flag，HTTP 开发环境不加避免浏览器拒绝
    const secure = req.protocol === 'https' ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `${ANONYMOUS_SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
    );
  }

  return sessionId;
}

// GET /api/preview/check - 检查未登录用户是否有试听资格
router.get('/preview/check', optionalAuth, async (req: AuthRequest, res: Response) => {
  // 已登录用户直接放行
  if (req.user) {
    return res.json({ allowed: true, is_guest: false });
  }

  // 服务端生成匿名 session，自动设置 Cookie
  const sessionId = getOrCreateAnonymousSessionId(req, res);
  const ip = getClientIp(req);
  const count = await getGuestTodayPreviewCount(sessionId, ip);

  if (count >= GUEST_PREVIEW_LIMIT) {
    return res.json({
      allowed: false,
      is_guest: true,
      error: `今日免费试听次数已用完（${count}/${GUEST_PREVIEW_LIMIT}）`,
      code: 'GUEST_LIMIT_REACHED',
      used: count,
      limit: GUEST_PREVIEW_LIMIT,
      remaining: 0
    });
  }

  return res.json({
    allowed: true,
    is_guest: true,
    used: count,
    limit: GUEST_PREVIEW_LIMIT,
    remaining: GUEST_PREVIEW_LIMIT - count
  });
});

// POST /api/preview/play - 记录未登录用户试听
router.post('/preview/play', previewPlayLimiter, optionalAuth, async (req: AuthRequest, res: Response) => {
  const { beat_id } = req.body as { beat_id?: number };

  // 已登录用户不需要这个接口
  if (req.user) {
    return res.json({ success: true, is_guest: false });
  }

  if (!beat_id) {
    return res.status(400).json({
      error: '缺少必要参数',
      code: 'MISSING_PARAMS'
    });
  }

  // 服务端生成匿名 session，自动设置 Cookie
  const sessionId = getOrCreateAnonymousSessionId(req, res);
  const ip = getClientIp(req);
  const count = await getGuestTodayPreviewCount(sessionId, ip);

  if (count >= GUEST_PREVIEW_LIMIT) {
    return res.status(403).json({
      error: `今日免费试听次数已用完（${count}/${GUEST_PREVIEW_LIMIT}）`,
      code: 'GUEST_LIMIT_REACHED',
      used: count,
      limit: GUEST_PREVIEW_LIMIT,
      remaining: 0
    });
  }

  await recordPreviewAccess(ANONYMOUS_USER_ID, beat_id, sessionId, ip);

  return res.json({
    success: true,
    is_guest: true,
    used: count + 1,
    limit: GUEST_PREVIEW_LIMIT,
    remaining: GUEST_PREVIEW_LIMIT - count - 1
  });
});

// GET /api/preview/status - 获取当前试听状态
router.get('/preview/status', optionalAuth, async (req: AuthRequest, res: Response) => {
  if (req.user) {
    const vipLevel = await getUserVipLevel(req);
    return res.json({
      is_guest: false,
      is_vip: vipLevel !== 'free',
      vip_level: vipLevel,
      can_full_preview: canFullPreview(vipLevel)
    });
  }

  // 服务端生成匿名 session，自动设置 Cookie
  const sessionId = getOrCreateAnonymousSessionId(req, res);
  const ip = getClientIp(req);
  const count = await getGuestTodayPreviewCount(sessionId, ip);

  return res.json({
    is_guest: true,
    used: count,
    limit: GUEST_PREVIEW_LIMIT,
    remaining: Math.max(0, GUEST_PREVIEW_LIMIT - count)
  });
});

export default router;
