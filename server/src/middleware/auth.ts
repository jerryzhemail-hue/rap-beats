import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
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
export function extractToken(req: Request): string | null {
  let raw = req.headers.authorization?.replace('Bearer ', '');
  if (!raw && req.query.token) {
    const q = req.query.token;
    if (typeof q === 'string') raw = q;
    else if (Array.isArray(q) && typeof q[0] === 'string') raw = q[0];
  }
  return raw ?? null;
}

function tokenHash(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** 检查 access token 是否在黑名单（已 revoked）。 */
async function isTokenRevoked(raw: string): Promise<boolean> {
  const db = getDatabaseClient();
  const hash = tokenHash(raw);
  const row = await db.queryOne<{ expires_at: string }>(
    'SELECT expires_at FROM revoked_tokens WHERE token_hash = ? LIMIT 1',
    [hash]
  );
  if (!row) return false;
  if (new Date(row.expires_at) < new Date()) {
    // 已过期，自动删除
    await db.execute('DELETE FROM revoked_tokens WHERE token_hash = ?', [hash]);
    return false;
  }
  return true;
}

// 必须登录
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: '请先登录' });
  try {
    // 显式指定算法：防止 algorithm confusion 攻击（攻击者用 RS256 公钥伪造 token）
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as unknown as TokenPayload;

    // 检查 token 是否已撤销
    if (await isTokenRevoked(token)) {
      return res.status(401).json({ error: 'Token已失效，请重新登录' });
    }

    const database = getDatabaseClient();
    const user = await database.queryOne<TokenPayload>(
      'SELECT id, username, email, role, is_beatmaker FROM users WHERE id = ?',
      [decoded.id]
    );
    if (!user) return res.status(401).json({ error: '登录状态已失效，请重新登录' });

    req.user = user;
    // 将原始 token 附加到请求对象（供 logout 使用）
    (req as any)._rawToken = token;
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
    if (await isTokenRevoked(token)) {
      return res.status(401).json({ error: 'Token已失效，请重新登录' });
    }
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as unknown as TokenPayload;
    const database = getDatabaseClient();
    const user = await database.queryOne<TokenPayload>(
      'SELECT id, username, email, role, is_beatmaker FROM users WHERE id = ?',
      [decoded.id]
    );
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }
    req.user = user;
    (req as any)._rawToken = token;
    next();
  } catch {
    return res.status(401).json({ error: 'Token无效或已过期' });
  }
}

// 可选登录（不强制）
export async function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) { next(); return; }
  try {
    if (await isTokenRevoked(token)) { next(); return; }
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as unknown as TokenPayload;
    const database = getDatabaseClient();
    const user = await database.queryOne<TokenPayload>(
      'SELECT id, username, email, role, is_beatmaker FROM users WHERE id = ?',
      [decoded.id]
    );
    if (user) req.user = user;
  } catch (e) {
    // 任意异常都按匿名访客放行，但至少打一条 debug 日志
    console.debug('[optionalAuth] token 验证失败（按匿名放行）:', (e as Error).message);
  }
  next();
}
