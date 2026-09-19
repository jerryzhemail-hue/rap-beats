import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { requireAuth, AuthRequest, JWT_SECRET } from '../middleware/auth.js';
import { getDatabaseClient } from '../database/client.js';
import { getEffectiveVipLevel } from '../middleware/vip.js';
import { validateUsername, validateEmail } from '../utils/validation.js';
import { serializeUserAssets } from '../utils/assets.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = Router();

// Sliding-window rate limits for auth endpoints
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

// POST /api/auth/register
router.post('/register', registerLimiter, async (req, res) => {
  const { username, email, password } = req.body as {
    username?: string;
    email?: string;
    password?: string;
  };

  // 验证输入
  if (!username || !email || !password) {
    return res.status(400).json({ error: '请填写所有必填字段' });
  }

  const usernameErr = validateUsername(username);
  if (usernameErr) return res.status(400).json({ error: usernameErr });
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });

  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少需要6位' });
  }

  const database = getDatabaseClient();

  // 检查用户名和邮箱是否已存在
  const existingUser = await database.queryOne<{ id: number }>(
    'SELECT id FROM users WHERE username = ? OR email = ?',
    [username, email]
  );

  if (existingUser) {
    return res.status(409).json({ error: '用户名或邮箱已被注册' });
  }

  // 密码哈希
  const salt = bcrypt.genSaltSync(10);
  const password_hash = bcrypt.hashSync(password, salt);

  // 插入用户（同时记录注册 IP）
  const registerIp = req.ip || '';
  const result = await database.execute(
    'INSERT INTO users (username, email, password_hash, register_ip) VALUES (?, ?, ?, ?)',
    [username, email, password_hash, registerIp]
  );

  if (!result.insertId) {
    return res.status(500).json({ error: '注册失败，请稍后重试' });
  }

  // 通知管理员：新用户注册
  const { createAdminNotification } = await import('./admin-notifications-helper.js');
  createAdminNotification({
    type: 'new_user_registered',
    title: '新用户注册',
    content: `用户 ${username} (${email}) 完成了注册`,
    data: { userId: result.insertId, username, email }
  }).catch(() => {});

  // 查询用户角色（第一个注册的用户可能被迁移脚本设为 admin）
  const userRow = await database.queryOne<{ role: string; vip_level: string; avatar_url: string | null; is_beatmaker: number }>(
    'SELECT role, vip_level, avatar_url, is_beatmaker FROM users WHERE id = ?',
    [result.insertId]
  );
  const role = userRow?.role || 'user';
  const vipLevel = getEffectiveVipLevel(userRow);
  const avatarUrl = userRow?.avatar_url || null;
  const user = serializeUserAssets({
    id: result.insertId,
    username,
    email,
    role,
    is_beatmaker: userRow?.is_beatmaker ?? 0,
    vip_level: vipLevel,
    avatar_url: avatarUrl
  });

  // 生成 Token
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

  res.status(201).json({ token, user });
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const rawBody = req.body as { login?: string; password?: string; username?: string; email?: string };
  // 兼容前端用 login / username / email 任一参数名提交
  const login = rawBody.login ?? rawBody.username ?? rawBody.email;
  const password = rawBody.password;

  if (!login || !password) {
    return res.status(400).json({ error: '请填写用户名/邮箱和密码' });
  }

  const database = getDatabaseClient();

  // 查找用户（支持用户名或邮箱登录）
  const user = await database.queryOne<{
    id: number;
    username: string;
    email: string;
    password_hash: string;
    role: string;
    vip_level: string;
    created_at: string;
    avatar_url: string | null;
    is_beatmaker: number;
  }>(
    'SELECT * FROM users WHERE username = ? OR email = ?',
    [login, login]
  );

  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  // 异步验证密码（避免同步调用阻塞事件循环）
  const isPasswordValid = await new Promise<boolean>((resolve) => {
    bcrypt.compare(password, user.password_hash, (_err, result) => {
      resolve(result === true);
    });
  });
  if (!isPasswordValid) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  // 异步更新最近登录 IP（不阻塞登录响应）
  const loginIp = req.ip || '';
  database.execute(
    'UPDATE users SET last_login_ip = ? WHERE id = ?',
    [loginIp, user.id]
  ).catch((err) => console.error('[login] IP 写入失败:', (err as Error).message));

  // 生成 Token
  const tokenPayload = serializeUserAssets({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    vip_level: getEffectiveVipLevel(user),
    avatar_url: user.avatar_url || null,
    is_beatmaker: user.is_beatmaker ?? 0
  });
  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

  res.json({ token, user: tokenPayload });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const database = getDatabaseClient();
  const user = await database.queryOne<{
    id: number;
    username: string;
    email: string;
    role: string;
    vip_level: string;
    vip_expire_at: string | null;
    avatar_url: string | null;
    created_at: string;
    is_beatmaker: number;
  }>(
    'SELECT id, username, email, role, vip_level, vip_expire_at, avatar_url, created_at, is_beatmaker FROM users WHERE id = ?',
    [req.user!.id]
  );

  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  res.json({
    user: serializeUserAssets({
      ...user,
      vip_level: getEffectiveVipLevel(user),
      vip_expire_at: user.role === 'admin' ? null : user.vip_expire_at
    })
  });
});

export default router;
