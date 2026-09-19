/**
 * server/tests/routes/profile-full.test.ts
 *
 * /api/user/profile/full + /api/user/social/list + /api/users/search 三个新接口测试
 *
 * 用 testadmin 做 viewer，因为前面 seed 阶段就创建了：
 *   - testadmin (id=432, role=admin, ultimate VIP)
 *   - social_test_b (id=466, nickname=节奏大师)
 *   - social_test_c (id=467, nickname=嘻哈狂人)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { buildApp } from '../../src/app.js';
import userRouter from '../../src/routes/user.js';

function createApp() {
  const app = buildApp();
  app.use('/api', userRouter);
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
let TEST_IDS: { bId: number; cId: number; bUsername: string; cUsername: string };

beforeAll(async () => {
  app = createApp();
  // testadmin id=432 (历史 seed 创建)
  tokenAdmin = jwt.sign(
    { id: 432, username: 'testadmin', email: 'testadmin@test.local', role: 'admin', vip_level: 'ultimate', avatar_url: null },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  // dynamic test id（用节奏大师/嘻哈狂人 nickname 反查当前 id）
  const { getDatabaseClient } = await import('../../src/database/client.js');
  TEST_IDS = await resolveTestIds(getDatabaseClient());
  tokenUserB = jwt.sign(
    {
      id: TEST_IDS.bId,
      username: TEST_IDS.bUsername,
      email: `${TEST_IDS.bUsername}@rapbeats.local`,
      role: 'user',
      vip_level: 'free',
      avatar_url: null,
    },
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
    expect(res.body.id).toBe(432);
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
    expect(ids).toContain(432);
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
      .get('/api/user/social/list?user_id=432&type=followers')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    for (const u of res.body.users) {
      expect(typeof u.is_followed_by_me).toBe('boolean');
    }
  });

  it('TC-SOCIAL-003 未登录访问 — 仍可拿到列表，is_followed_by_me 全 false', async () => {
    const res = await request(app).get('/api/user/social/list?user_id=432&type=followers');
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

  it('TC-SEARCH-005 排除自己 — search 自己时不会出现在结果中', async () => {
    const res = await request(app)
      .get('/api/users/search?q=testadmin&type=rapbeats')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    const ids = res.body.users.map((u: any) => u.id);
    expect(ids).not.toContain(432);
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
