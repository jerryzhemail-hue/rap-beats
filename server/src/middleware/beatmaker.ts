import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, JWT_SECRET } from './auth.js';
import { getDatabaseClient } from '../database/client.js';

type TokenPayload = {
  id: number;
  role?: string;
  is_beatmaker?: number;
};

async function resolveUser(req: AuthRequest): Promise<TokenPayload | null> {
  const raw = req.headers.authorization?.replace('Bearer ', '');
  if (!raw && req.query.token) {
    const q = req.query.token;
    if (typeof q === 'string') req.headers.authorization = `Bearer ${q}`;
    else if (Array.isArray(q) && typeof q[0] === 'string') req.headers.authorization = `Bearer ${q[0]}`;
  }
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as TokenPayload;
    const db = getDatabaseClient();
    const user = await db.queryOne<TokenPayload>(
      'SELECT id, role, is_beatmaker FROM users WHERE id = ?',
      [decoded.id]
    );
    return user || null;
  } catch {
    return null;
  }
}

/**
 * 必须 Beatmaker 原创制作人认证通过。
 * 用户必须已登录且 users.is_beatmaker = 1，否则 403。
 */
export async function requireBeatmaker(req: AuthRequest, res: Response, next: NextFunction) {
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ error: '请先登录' });
  req.user = { ...(req.user || { id: 0, username: '', email: '', role: user.role || 'user' }), id: user.id, role: user.role || 'user', is_beatmaker: user.is_beatmaker ?? 0 } as any;
  if ((user.is_beatmaker ?? 0) !== 1) {
    return res.status(403).json({
      error: '需要 Beatmaker 原创制作人认证',
      code: 'BEATMAKER_REQUIRED',
      redirect_to: '/beatmaker/apply'
    });
  }
  next();
}

/**
 * 允许 Beatmaker 或管理员上传作品。
 * 用于替换原先 upload 路由上的 requireAdmin。
 */
export async function requireUploader(req: AuthRequest, res: Response, next: NextFunction) {
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ error: '请先登录' });
  req.user = { ...(req.user || { id: 0, username: '', email: '', role: user.role || 'user' }), id: user.id, role: user.role || 'user', is_beatmaker: user.is_beatmaker ?? 0 } as any;
  const isAdmin = user.role === 'admin';
  const isBeatmaker = (user.is_beatmaker ?? 0) === 1;
  if (!isAdmin && !isBeatmaker) {
    return res.status(403).json({
      error: '需要 Beatmaker 原创制作人认证或管理员身份',
      code: 'UPLOADER_REQUIRED',
      redirect_to: '/beatmaker/apply'
    });
  }
  next();
}
