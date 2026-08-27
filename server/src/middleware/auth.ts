import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDatabaseClient } from '../database/client.js';

const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret) {
  throw new Error('Missing required environment variable: JWT_SECRET');
}

export const JWT_SECRET: string = rawJwtSecret;
export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    email: string;
    role: string;
    is_beatmaker?: number;
  };
}

type TokenPayload = {
  id: number;
  username: string;
  email: string;
  role: string;
  is_beatmaker?: number;
};

/** 从 Authorization header 或 ?token= query 参数中提取原始 JWT 字符串。 */
function extractToken(req: Request): string | null {
  let raw = req.headers.authorization?.replace('Bearer ', '');
  if (!raw && req.query.token) {
    const q = req.query.token;
    if (typeof q === 'string') raw = q;
    else if (Array.isArray(q) && typeof q[0] === 'string') raw = q[0];
  }
  return raw ?? null;
}

async function resolveCurrentUserFromToken(decoded: TokenPayload) {
  const database = getDatabaseClient();
  const byId = await database.queryOne<TokenPayload>(
    'SELECT id, username, email, role, is_beatmaker FROM users WHERE id = ?',
    [decoded.id]
  );
  if (byId) return byId;

  // 兼容用户 ID 被重排后的旧 token，优先按邮箱回捞，再按用户名回捞。
  return database.queryOne<TokenPayload>(
    'SELECT id, username, email, role, is_beatmaker FROM users WHERE email = ? OR username = ? LIMIT 1',
    [decoded.email, decoded.username]
  );
}

// 必须登录
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: '请先登录' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as TokenPayload;
    const user = await resolveCurrentUserFromToken(decoded);
    if (!user) return res.status(401).json({ error: '登录状态已失效，请重新登录' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token无效或已过期' });
  }
}

// 必须管理员
export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: '请先登录' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as TokenPayload;
    const user = await resolveCurrentUserFromToken(decoded);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token无效或已过期' });
  }
}

// 可选登录（不强制）
export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) { next(); return; }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as TokenPayload;
    const user = await resolveCurrentUserFromToken(decoded);
    if (user) req.user = user;
  } catch {
    // 任意异常都按匿名访客放行，绝不阻塞音频流
  }
  next();
}
