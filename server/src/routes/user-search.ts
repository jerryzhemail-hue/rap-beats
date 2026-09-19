import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDatabaseClient, getForumDatabaseClient } from '../database/client.js';

const router = Router();

router.get('/users/search', requireAuth, async (req: AuthRequest, res) => {
  const db = getDatabaseClient();
  const forumDb = getForumDatabaseClient();
  const q = (req.query.q as string || '').trim();
  // 转义 LIKE 通配符（% _ \），避免用户输入匹配全部/单字符
  function escapeLike(input: string): string {
    return input.replace(/[%_\\]/g, '\\$&');
  }
  const qEsc = escapeLike(q);
  const qPrefix = escapeLike(q);
  const qContains = `%${qEsc}%`;
  // 类型推断保留（在 if/else 内部用 qPrefix/qContains）
  const type = (req.query.type === 'nickname' ? 'nickname' : 'rapbeats') as 'rapbeats' | 'nickname';
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  if (!q) {
    return res.json({ users: [], total: 0, page, totalPages: 0 });
  }

  // 黑名单过滤：使用 forum 库的 forum_blocks（forum 是黑名单事实源）
  const [blockedMe, iBlocked] = await Promise.all([
    forumDb.queryMany<{ user_id: number }>(
      'SELECT user_id FROM forum_blocks WHERE blocked_user_id = ?',
      [req.user!.id]
    ),
    forumDb.queryMany<{ blocked_user_id: number }>(
      'SELECT blocked_user_id FROM forum_blocks WHERE user_id = ?',
      [req.user!.id]
    ),
  ]);
  // 排除：屏蔽过我的 + 我屏蔽的（黑名单过滤）。NOTE: 当前不再排除自己，
  //       以便用户能搜索到自己的账号/昵称（业务需求）。如未来要恢复排除，
  //       在数组里加回 req.user!.id 即可。
  const excludeIds = [...blockedMe.map(b => b.user_id), ...iBlocked.map(b => b.blocked_user_id)];
  // 没有要排除的 id 时，NOT IN 子句必须整体省略 —— 拼成 `id NOT IN (NULL)`
  // 会让整个谓词变 UNKNOWN（MySQL 行为），导致结果集永远为空。
  const excludeSql = excludeIds.length > 0
    ? `id NOT IN (${excludeIds.map(() => '?').join(',')})`
    : '1=1';

  // 探测列
  const cols = await db.queryMany<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`
  );
  const colSet = new Set(cols.map(c => c.COLUMN_NAME));
  const hasNickname = colSet.has('nickname');
  const hasNicknamePinyin = colSet.has('nickname_pinyin');
  const hasAvatarUrl = colSet.has('avatar_url');
  const avatarCol = hasAvatarUrl ? 'avatar_url' : (colSet.has('avatar') ? 'avatar' : 'NULL');

  let whereSql: string;
  let whereParams: any[];
  let orderSql: string;
  let orderParams: any[];

  if (type === 'rapbeats') {
    // RAP BEATS 账号搜索：精确 > 前缀 > 子串（LIKE 子句需转义；= 和前缀匹配是等值）
    whereSql = 'username LIKE ?';
    whereParams = [qContains];
    orderSql = `ORDER BY
        CASE WHEN username = ? THEN 0
             WHEN username LIKE ? THEN 1
             ELSE 2 END,
        id ASC`;
    orderParams = [q, `${qPrefix}%`];
  } else {
    // 昵称模糊搜索：精确 > 前缀 > 子串（昵称本身 LIKE 匹配，足够覆盖场景）
    //   - 不再用 nickname_pinyin 联合搜索，因为当前 pinyin 是 nickname 原样（无拼音转换），
    //     拼音匹配会让中文昵称反而搜不到。预留列，等接入 pinyin-pro 等库时再启用。
    //   - nickname IS NOT NULL 过滤掉 NULL 行（避免 NULL LIKE 返回 NULL）
    const conditions: string[] = ['nickname IS NOT NULL', 'nickname LIKE ?'];
    whereParams = [qContains];
    whereSql = `(${conditions.join(' AND ')})`;
    orderSql = `ORDER BY
        CASE WHEN nickname = ? THEN 0
             WHEN nickname LIKE ? THEN 1
             ELSE 2 END,
        id ASC`;
    orderParams = [q, `${qPrefix}%`];
  }

  const total = (await db.queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM users WHERE ${excludeSql} AND ${whereSql}`,
    [...excludeIds, ...whereParams]
  ))?.c ?? 0;

  const users = await db.queryMany<{
    id: number; username: string; nickname: string | null; avatar_url: string | null;
    is_beatmaker: number; vip_level: string;
  }>(
    `SELECT id, username, nickname, ${avatarCol} AS avatar_url, is_beatmaker, vip_level
       FROM users
      WHERE ${excludeSql}
        AND ${whereSql}
      ${orderSql}
      LIMIT ? OFFSET ?`,
    [...excludeIds, ...whereParams, ...orderParams, limit, offset]
  );

  res.json({
    type,
    users: users.map(u => ({
      id: u.id,
      username: u.username,
      nickname: u.nickname || u.username,
      avatar_url: u.avatar_url || null,
      is_beatmaker: u.is_beatmaker ?? 0,
      vip_level: u.vip_level || 'free',
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

export default router;
