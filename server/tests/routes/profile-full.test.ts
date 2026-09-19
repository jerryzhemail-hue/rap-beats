/**
 * server/tests/routes/profile-full.test.ts
 *
 * /api/user/profile/full + /api/user/social/list + /api/users/search 三个新接口测试
 *
 * 自包含：beforeAll 动态创建 testadmin / social_test_b / social_test_c，不依赖历史 seed。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { buildApp } from '../../src/app.js';
import userRouter from '../../src/routes/user.js';
import userSocialRouter from '../../src/routes/user-social.js';
import userSearchRouter from '../../src/routes/user-search.js';

function createApp() {
  const app = buildApp();
  app.use('/api', userRouter);
  app.use('/api', userSocialRouter);
  app.use('/api', userSearchRouter);
  return app;
}

// 与 server/src/middleware/auth.ts 中保持一致
const JWT_SECRET = process.env.JWT_SECRET || 'rapbeats-dev-secret-change-me';

// 查找当前测试用的账号 ID（允许 e2e 数据多次 seed 后 ID 不固定）
// 优先取符合 `social_test_*` 模式且 nickname=节奏大师/嘻哈狂人的 user
async function resolveTestIds(database: any) {
  const b = await database.queryOne<{ id: number; username: string }>(
    "SELECT id, username FROM users WHERE nickname = '节奏大师' LIMIT 1"
  );
  const c = await database.queryOne<{ id: number; username: string }>(
    "SELECT id, username FROM users WHERE nickname = '嘻哈狂人' LIMIT 1"
  );
  return {
    bId: b?.id ?? 0,
    cId: c?.id ?? 0,
    bUsername: b?.username ?? '',
    cUsername: c?.username ?? '',
  };
}

let app: ReturnType<typeof createApp>;
let tokenAdmin: string;
let tokenUserB: string;
let ADMIN_ID: number;
let TEST_IDS: { bId: number; cId: number; bUsername: string; cUsername: string };

beforeAll(async () => {
  app = createApp();
  const { getDatabaseClient, getForumDatabaseClient } = await import('../../src/database/client.js');
  const db = getDatabaseClient();
  const forumDb = getForumDatabaseClient();

  // 独立测试库，先清理本文件涉及的测试数据，确保自包含、不依赖历史 seed
  await forumDb.execute("DELETE FROM forum_follows WHERE follower_id IN (SELECT id FROM (SELECT id FROM rap_beats_test.users WHERE username IN ('testadmin','social_test_b','social_test_c')) t) OR following_id IN (SELECT id FROM (SELECT id FROM rap_beats_test.users WHERE username IN ('testadmin','social_test_b','social_test_c')) t)");
  await db.execute("DELETE FROM users WHERE username IN ('testadmin','social_test_b','social_test_c')");

  // 动态创建 testadmin（真实 id 不再硬编码 432）
  const admin = await db.execute(
    "INSERT INTO users (username, email, password_hash, role, vip_level) VALUES ('testadmin', 'testadmin@test.local', 'x', 'admin', 'ultimate')"
  );
  ADMIN_ID = admin.insertId;

  // 动态创建 social_test_b/c（nickname 节奏大师/嘻哈狂人）
  const b = await db.execute(
    "INSERT INTO users (username, email, password_hash, role, vip_level, nickname) VALUES ('social_test_b', 'social_test_b@rapbeats.local', 'x', 'user', 'free', '节奏大师')"
  );
  const c = await db.execute(
    "INSERT INTO users (username, email, password_hash, role, vip_level, nickname) VALUES ('social_test_c', 'social_test_c@rapbeats.local', 'x', 'user', 'free', '嘻哈狂人')"
  );
  TEST_IDS = { bId: b.insertId, cId: c.insertId, bUsername: 'social_test_b', cUsername: 'social_test_c' };

  // 建立关注关系：testadmin 关注 b/c，b 关注 testadmin（供 social/list 测试）
  await forumDb.execute(
    "INSERT INTO forum_follows (follower_id, following_id) VALUES (?, ?), (?, ?), (?, ?)",
    [ADMIN_ID, TEST_IDS.bId, ADMIN_ID, TEST_IDS.cId, TEST_IDS.bId, ADMIN_ID]
  );

  tokenAdmin = jwt.sign(
    { id: ADMIN_ID, username: 'testadmin', email: 'testadmin@test.local', role: 'admin', vip_level: 'ultimate', avatar_url: null },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  tokenUserB = jwt.sign(
    { id: TEST_IDS.bId, username: TEST_IDS.bUsername, email: `${TEST_IDS.bUsername}@rapbeats.local`, role: 'user', vip_level: 'free', avatar_url: null },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
});

describe('GET /api/user/profile/full', () => {
  it('TC-PROFILE-001 自己看自己 — is_self=true / 邮箱可见', async () => {
    const res = await request(app)
      .get('/api/user/profile/full')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ADMIN_ID);
    expect(res.body.username).toBe('testadmin');
    expect(res.body.is_self).toBe(true);
    expect(res.body.email).toBe('testadmin@test.local');
    // 关键字段存在
    expect(res.body).toHaveProperty('stats');
    expect(res.body.stats).toHaveProperty('following_count');
    expect(res.body.stats).toHaveProperty('follower_count');
    expect(res.body.stats).toHaveProperty('likes_received');
    expect(res.body.stats).toHaveProperty('favorites_count');
    // stats 必须是数字（不是字符串）
    expect(typeof res.body.stats.following_count).toBe('number');
    expect(typeof res.body.stats.likes_received).toBe('number');
  });

  it('TC-PROFILE-002 看别人 — 邮箱隐藏', async () => {
    if (!TEST_IDS.bId) return; // skip if no seed data
    const res = await request(app)
      .get(`/api/user/profile/full?user_id=${TEST_IDS.bId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.is_self).toBe(false);
    expect(res.body.email).toBeNull();
  });

  it('TC-PROFILE-003 stats 类型稳定 — 大整数也不会被转字符串', async () => {
    const res = await request(app)
      .get('/api/user/profile/full')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    const { stats } = res.body;
    for (const key of Object.keys(stats)) {
      expect(typeof stats[key]).toBe('number');
      expect(Number.isNaN(stats[key])).toBe(false);
    }
  });

  it('TC-PROFILE-004 未登录 — 返回 401', async () => {
    const res = await request(app).get('/api/user/profile/full');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/user/social/list', () => {
  it('TC-SOCIAL-001 关注列表（following）— 返回关注的人', async () => {
    if (!TEST_IDS.bId) return; // skip if no seed
    const res = await request(app)
      .get(`/api/user/social/list?user_id=${TEST_IDS.bId}&type=followers`)  // 查 b 的粉丝（即 admin 等于 b 的 follower）
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('followers');
    expect(Array.isArray(res.body.users)).toBe(true);
    // 验证 testadmin (432) 在 b 的粉丝列表中
    const ids = res.body.users.map((u: any) => u.id);
    expect(ids).toContain(ADMIN_ID);
    // 每条 item 字段完整
    for (const u of res.body.users) {
      expect(u).toHaveProperty('id');
      expect(u).toHaveProperty('username');
      expect(u).toHaveProperty('nickname');
      expect(u).toHaveProperty('is_beatmaker');
      expect(u).toHaveProperty('is_followed_by_me');
    }
  });

  it('TC-SOCIAL-002 粉丝列表（followers）— is_followed_by_me 反映 viewer 状态', async () => {
    if (!TEST_IDS.bId) return;
    // testadmin 视角看自己 (432) 的 followers
    const res = await request(app)
      .get(`/api/user/social/list?user_id=${ADMIN_ID}&type=followers`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    for (const u of res.body.users) {
      expect(typeof u.is_followed_by_me).toBe('boolean');
    }
  });

  it('TC-SOCIAL-003 未登录访问 — 仍可拿到列表，is_followed_by_me 全 false', async () => {
    const res = await request(app).get(`/api/user/social/list?user_id=${ADMIN_ID}&type=followers`);
    expect(res.status).toBe(200);
    for (const u of res.body.users) {
      expect(u.is_followed_by_me).toBe(false);
    }
  });

  it('TC-SOCIAL-004 无效 user_id — 400', async () => {
    const res = await request(app).get('/api/user/social/list?user_id=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('无效');
  });

  it('TC-SOCIAL-005 用户不存在 — 404', async () => {
    const res = await request(app).get('/api/user/social/list?user_id=999999');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/users/search', () => {
  it('TC-SEARCH-001 RAP BEATS 账号搜索 — 精确匹配排第一', async () => {
    if (!TEST_IDS.bId) return;
    // testadmin 搜 social_test_b（admin 不在排除列表里）
    const res = await request(app)
      .get(`/api/users/search?q=${TEST_IDS.bUsername}&type=rapbeats`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('rapbeats');
    expect(res.body.users.length).toBeGreaterThanOrEqual(1);
    expect(res.body.users[0].username).toBe(TEST_IDS.bUsername);
    expect(res.body.users[0].nickname).toBe('节奏大师');
  });

  it('TC-SEARCH-002 昵称搜索（中文子串）— 模糊命中', async () => {
    if (!TEST_IDS.bId) return;
    // 通过 Python urllib.parse.quote 把 "节奏" 编码为 UTF-8 percent-encoding
    const q = encodeURIComponent('节奏');
    const res = await request(app)
      .get(`/api/users/search?q=${q}&type=nickname`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('nickname');
    const hits = res.body.users.filter((u: any) => u.id === TEST_IDS.bId);
    expect(hits.length).toBe(1);
  });

  it('TC-SEARCH-003 默认 type — 兼容旧调用', async () => {
    const res = await request(app)
      .get('/api/users/search?q=testadmin')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('rapbeats');
  });

  it('TC-SEARCH-004 空 query — 返回空列表', async () => {
    const res = await request(app)
      .get('/api/users/search?q=')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('TC-SEARCH-005 搜索自己 — 业务已不排除自己，结果应包含自己', async () => {
    const res = await request(app)
      .get('/api/users/search?q=testadmin&type=rapbeats')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    const ids = res.body.users.map((u: any) => u.id);
    expect(ids).toContain(ADMIN_ID);
  });

  it('TC-SEARCH-006 昵称搜索时排除 NULL nickname 行', async () => {
    // 关键字选取应该只命中真的有 nickname 的用户
    const q = encodeURIComponent('嘻哈');
    const res = await request(app)
      .get(`/api/users/search?q=${q}&type=nickname`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    for (const u of res.body.users) {
      expect(u.nickname).not.toBeNull();
    }
  });
});
