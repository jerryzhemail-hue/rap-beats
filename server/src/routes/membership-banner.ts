/**
 * 会员权益弹框 — IP 频控路由
 *
 * 业务目标:
 * - 首页"会员权益一览"弹框(MembershipBanner)每次加载都会弹出,体验很差。
 * - 改造为: 同一 IP 在 cooldown 窗口(默认 24 小时)内只弹一次。
 *
 * 设计要点:
 * - 公开接口(无需登录),因为弹框对游客也要工作。
 * - 使用客户端真实 IP(优先 X-Forwarded-For, 兼容反向代理),服务端通过 UNIQUE(ip_address)
 *   表存首次 / 最近访问时间,前端根据接口返回的 shouldShow 决定是否弹出。
 * - 弹框关闭由前端本地状态控制,这里只决定"是否该弹";每页首次进入 App 时
 *   调用 status 接口,若 shouldShow=true 则再调用 record 接口落地一次访问记录。
 */
import { Router, type Request, type Response } from 'express';
import { getDatabaseClient } from '../database/client.js';

const router = Router();

/** 弹框冷却窗口(毫秒): 默认 24 小时 */
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * 提取客户端真实 IP,优先 X-Forwarded-For(第一个),再退到 socket 地址。
 * 与 server/src/routes/preview.ts 中的 getClientIp 保持一致的提取逻辑。
 */
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

/**
 * 归一化 IP:IPv4-mapped IPv6(::ffff:1.2.3.4 → 1.2.3.4),避免因代理层封装导致同一客户端
 * 被识别成不同地址、绕过 24h 冷却。
 */
function normalizeIp(ip: string): string {
  if (!ip || ip === 'unknown') return 'unknown';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

/**
 * GET /api/membership-banner/status
 *
 * 返回:
 * - shouldShow: 当前是否应该弹框(true 表示需要弹)
 * - nextEligibleAt: 下次可弹框的 ISO 时间戳(shouldShow=false 时有意义)
 * - cooldownMs: 冷却窗口长度(毫秒),便于前端展示倒计时
 */
router.get('/status', async (req: Request, res: Response) => {
  const db = getDatabaseClient();
  const ip = normalizeIp(getClientIp(req));

  // 兜底:拿不到 IP 时直接放行,避免拦截掉所有访问
  if (!ip || ip === 'unknown') {
    return res.json({
      shouldShow: true,
      reason: 'no_ip',
      nextEligibleAt: null,
      cooldownMs: COOLDOWN_MS,
    });
  }

  const row = await db.queryOne<{ last_seen_at: Date; first_seen_at: Date; view_count: number }>(
    `SELECT first_seen_at, last_seen_at, view_count
       FROM membership_banner_views
      WHERE ip_address = ?
      LIMIT 1`,
    [ip]
  );

  if (!row) {
    // 该 IP 从未记录过,应弹出
    return res.json({
      shouldShow: true,
      reason: 'first_visit',
      nextEligibleAt: null,
      cooldownMs: COOLDOWN_MS,
    });
  }

  const lastSeen = new Date(row.last_seen_at).getTime();
  const elapsed = Date.now() - lastSeen;

  if (elapsed >= COOLDOWN_MS) {
    // 已超过冷却窗口,可以再次弹出
    return res.json({
      shouldShow: true,
      reason: 'cooldown_elapsed',
      nextEligibleAt: null,
      cooldownMs: COOLDOWN_MS,
    });
  }

  // 仍在冷却窗口内,抑制弹框
  const nextEligibleAt = new Date(lastSeen + COOLDOWN_MS).toISOString();
  return res.json({
    shouldShow: false,
    reason: 'cooldown_active',
    nextEligibleAt,
    cooldownMs: COOLDOWN_MS,
  });
});

/**
 * POST /api/membership-banner/record
 *
 * 落地一条访问记录。若该 IP 已存在则累加 view_count 并刷新 last_seen_at;
 * 不存在则插入新行。无需鉴权(游客也会记录)。
 */
router.post('/record', async (req: Request, res: Response) => {
  const db = getDatabaseClient();
  const ip = normalizeIp(getClientIp(req));

  if (!ip || ip === 'unknown') {
    // 拿不到 IP 时直接返回成功,不落库(避免 'unknown' 行污染)
    return res.json({ recorded: false, reason: 'no_ip' });
  }

  // 用 INSERT ... ON DUPLICATE KEY UPDATE 一次完成 upsert
  await db.execute(
    `INSERT INTO membership_banner_views (ip_address, first_seen_at, last_seen_at, view_count)
     VALUES (?, NOW(), NOW(), 1)
     ON DUPLICATE KEY UPDATE
       last_seen_at = NOW(),
       view_count = view_count + 1`,
    [ip]
  );

  return res.json({ recorded: true });
});

export default router;
