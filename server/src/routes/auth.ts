import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { requireAuth, AuthRequest, JWT_SECRET } from '../middleware/auth.js';
import { getDatabaseClient } from '../database/client.js';
import { getEffectiveVipLevel } from '../middleware/vip.js';
import { validateUsername, validateEmail, validatePassword } from '../utils/validation.js';
import { serializeUserAssets } from '../utils/assets.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = Router();

// ─── Access token 配置 ────────────────────────────────────────────────────────
// 缩短至 1h（原 7d），配合 refresh token 轮换减少泄露窗口
const ACCESS_TOKEN_TTL = '1h';
// Refresh token 有效期 30 天
const REFRESH_TOKEN_TTL_DAYS = 30;

// ─── 防御时序攻击：固定 dummy hash ──────────────────────────────────────────
// H-4: 即使用户不存在，也执行一次 bcrypt.compare，使响应时间与用户是否存在无关
const DUMMY_HASH = bcrypt.hashSync('__DUMMY_PASSWORD_NEVER_MATCH__', 10);

// ─── Rate limits ──────────────────────────────────────────────────────────────
const registerLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 5,
  message: '注册过于频繁，请在1分钟后重试',
});
const loginLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 8,
  message: '登录尝试过于频繁，请在1分钟后重试',
});
const logoutLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 10,
  message: '操作过于频繁',
});
const refreshLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 5,
  message: '刷新过于频繁',
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** 计算 refresh token SHA-256 hash（用于存库） */
function tokenHash(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** 签发 access token（payload 不含 vip_level，由服务端实时查） */
function signAccessToken(user: {
  id: number; username: string; email: string; role: string; is_beatmaker?: number;
}): string {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    is_beatmaker: user.is_beatmaker ?? 0,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

/** 签发一次性 refresh token 并入库，返回原始 token 字符串 */
async function issueRefreshToken(userId: number): Promise<string> {
  const db = getDatabaseClient();
  const raw = crypto.randomBytes(32).toString('base64url');
  const hash = tokenHash(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await db.execute(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [userId, hash, expiresAt]
  );
  return raw;
}

/** 检查 access token 是否在黑名单 */
async function isTokenRevoked(raw: string): Promise<boolean> {
  const db = getDatabaseClient();
  const hash = tokenHash(raw);
  const row = await db.queryOne<{ expires_at: string }>(
    'SELECT expires_at FROM revoked_tokens WHERE token_hash = ? LIMIT 1',
    [hash]
  );
  if (!row) return false;
  // 过期则自动失效，删除记录
  if (new Date(row.expires_at) < new Date()) {
    await db.execute('DELETE FROM revoked_tokens WHERE token_hash = ?', [hash]);
    return false;
  }
  return true;
}

// ─── 路由实现 ───────────────────────────────────────────────────────────────

// POST /api/auth/register
router.post('/register', registerLimiter, async (req, res) => {
  const { username, email, password } = req.body as {
    username?: string; email?: string; password?: string;
  };

  if (!username || !email || !password) {
    return res.status(400).json({ error: '请填写所有必填字段' });
  }

  const usernameErr = validateUsername(username);
  if (usernameErr) return res.status(400).json({ error: usernameErr });
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  const passwordErr = validatePassword(password);
  if (passwordErr) return res.status(400).json({ error: passwordErr });

  const database = getDatabaseClient();
  const existingUser = await database.queryOne<{ id: number }>(
    'SELECT id FROM users WHERE username = ? OR email = ?', [username, email]
  );
  if (existingUser) {
    return res.status(409).json({ error: '用户名或邮箱已被注册' });
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const registerIp = req.ip || '';
  const result = await database.execute(
    'INSERT INTO users (username, email, password_hash, register_ip) VALUES (?, ?, ?, ?)',
    [username, email, password_hash, registerIp]
  );
  if (!result.insertId) {
    return res.status(500).json({ error: '注册失败，请稍后重试' });
  }

  // 通知管理员
  const { createAdminNotification } = await import('./admin-notifications-helper.js');
  createAdminNotification({
    type: 'new_user_registered',
    title: '新用户注册',
    content: `用户 ${username} (${email}) 完成了注册`,
    data: { userId: result.insertId, username, email },
  }).catch(() => {});

  const userRow = await database.queryOne<{
    role: string; vip_level: string; avatar_url: string | null; is_beatmaker: number;
  }>('SELECT role, vip_level, avatar_url, is_beatmaker FROM users WHERE id = ?', [result.insertId]);

  // 签发 access token（payload 不含 vip_level）
  const tokenPayload = {
    id: result.insertId,
    username,
    email,
    role: userRow?.role || 'user',
    is_beatmaker: userRow?.is_beatmaker ?? 0,
  };
  const token = signAccessToken(tokenPayload);
  const refreshToken = await issueRefreshToken(result.insertId);

  res.status(201).json({
    token,
    refresh_token: refreshToken,
    user: serializeUserAssets({
      ...tokenPayload,
      vip_level: getEffectiveVipLevel(userRow),
    } as any),
  });
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const rawBody = req.body as { login?: string; password?: string; username?: string; email?: string };
  const login = rawBody.login ?? rawBody.username ?? rawBody.email;
  const password = rawBody.password;

  if (!login || !password) {
    return res.status(400).json({ error: '请填写用户名/邮箱和密码' });
  }

  const database = getDatabaseClient();
  const user = await database.queryOne<{
    id: number; username: string; email: string; password_hash: string;
    role: string; vip_level: string; avatar_url: string | null; is_beatmaker: number;
  }>(
    'SELECT * FROM users WHERE username = ? OR email = ?', [login, login]
  );

  // H-4: 无论用户是否存在，都执行一次 bcrypt.compare（防时序攻击）
  await new Promise<void>((resolve) => {
    bcrypt.compare(password, DUMMY_HASH, () => resolve());
  });

  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const isPasswordValid = await new Promise<boolean>((resolve) => {
    bcrypt.compare(password, user.password_hash, (_err, result) => resolve(result === true));
  });
  if (!isPasswordValid) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  // 异步更新登录 IP
  const loginIp = req.ip || '';
  database.execute(
    'UPDATE users SET last_login_ip = ? WHERE id = ?', [loginIp, user.id]
  ).catch((err) => console.error('[login] IP 写入失败:', (err as Error).message));

  const tokenPayload = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    is_beatmaker: user.is_beatmaker ?? 0,
  };
  const token = signAccessToken(tokenPayload);
  const refreshToken = await issueRefreshToken(user.id);

  res.json({
    token,
    refresh_token: refreshToken,
    user: serializeUserAssets({ ...tokenPayload, vip_level: getEffectiveVipLevel(user) } as any),
  });
});

// POST /api/auth/logout
router.post('/logout', logoutLimiter, requireAuth, async (req: AuthRequest, res) => {
  const token = (req as any)._rawToken as string | undefined;
  if (token) {
    const db = getDatabaseClient();
    const hash = tokenHash(token);
    const expiresAt = new Date(Date.now() + 3600_000); // 黑名单保留 1h（大于 token TTL）
    await db.execute(
      'INSERT IGNORE INTO revoked_tokens (token_hash, expires_at) VALUES (?, ?)',
      [hash, expiresAt]
    );
  }
  res.json({ message: '已退出登录' });
});

// POST /api/auth/refresh
router.post('/refresh', refreshLimiter, async (req, res) => {
  const { refresh_token } = req.body as { refresh_token?: string };
  if (!refresh_token) {
    return res.status(400).json({ error: '缺少 refresh_token' });
  }

  const db = getDatabaseClient();
  const hash = tokenHash(refresh_token);
  const row = await db.queryOne<{
    id: number; user_id: number; expires_at: string; used_at: string | null;
  }>(
    'SELECT id, user_id, expires_at, used_at FROM refresh_tokens WHERE token_hash = ? LIMIT 1',
    [hash]
  );

  // 无论何种失败，统一返回相同错误（防 token 存在性枚举）
  const errorResp = () => res.status(401).json({ error: 'refresh_token 无效或已过期' });

  if (!row) return errorResp();
  if (row.used_at) return errorResp();
  if (new Date(row.expires_at) < new Date()) return errorResp();

  // 标记为已使用（一次性）
  await db.execute('UPDATE refresh_tokens SET used_at = NOW() WHERE id = ?', [row.id]);

  // 查用户信息
  const user = await db.queryOne<{
    id: number; username: string; email: string; role: string; is_beatmaker: number;
  }>('SELECT id, username, email, role, is_beatmaker FROM users WHERE id = ?', [row.user_id]);
  if (!user) return errorResp();

  const token = signAccessToken(user);
  const newRefreshToken = await issueRefreshToken(user.id);

  res.json({
    token,
    refresh_token: newRefreshToken,
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const user = await database.queryOne<{
    id: number; username: string; email: string; role: string;
    vip_level: string; vip_expire_at: string | null;
    avatar_url: string | null; created_at: string; is_beatmaker: number;
  }>(
    'SELECT id, username, email, role, vip_level, vip_expire_at, avatar_url, created_at, is_beatmaker FROM users WHERE id = ?',
    [req.user!.id]
  );
  if (!user) return res.status(404).json({ error: '用户不存在' });

  res.json({
    user: serializeUserAssets({
      ...user,
      vip_level: getEffectiveVipLevel(user),
      vip_expire_at: user.role === 'admin' ? null : user.vip_expire_at,
    } as any),
  });
});

export default router;
