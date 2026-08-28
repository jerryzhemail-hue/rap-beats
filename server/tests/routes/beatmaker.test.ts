/**
 * server/tests/routes/beatmaker.test.ts
 * Beatmaker 原创制作人认证接口测试
 *
 * 测试范围：
 * - 申请提交（字段校验、重复申请、冷却期）
 * - 申请状态查询
 * - Beatmaker 公开档案
 * - Beatmaker 列表
 * - Beatmaker 更新自己资料
 * - Admin 审核列表/详情/通过/拒绝
 *
 * 前置：数据库已初始化（npm run dev 启动时会自动 initDatabase）
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../../src/app.js';
import beatmakerRouter from '../../src/routes/beatmaker.js';
import adminBeatmakerRouter from '../../src/routes/admin-beatmaker.js';
import authRouter from '../../src/routes/auth.js';
import express from 'express';
import request from 'supertest';
import { getDatabaseClient } from '../../src/database/client.js';
import { createAdmin, createUser, authHeader, cleanupTestUsers } from '../helpers.js';

function createApp() {
  const app = buildApp();
  app.use('/api/auth', authRouter);
  app.use('/api/beatmaker', beatmakerRouter);
  app.use('/api/admin/beatmaker-applications', adminBeatmakerRouter);
  return app;
}

const VALID_APPLICATION = {
  real_name: '张三',
  id_card_no: '110101199001011234',
  portfolio_url: 'https://example.com/portfolio',
  sample_work_url: 'https://example.com/sample',
  bio: '我是来自北京的说唱音乐制作人，擅长 Trap 风格',
};

describe('Beatmaker 申请 - POST /api/beatmaker/apply', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => { app = createApp(); });
  afterAll(() => cleanupTestUsers());

  it('TC-BM-001 P0 正常提交申请', async () => {
    const { token } = await createUser(app);
    const res = await request(app)
      .post('/api/beatmaker/apply')
      .set(authHeader(token))
      .send(VALID_APPLICATION);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('application_id');
    expect(typeof res.body.application_id).toBe('number');
  });

  it('TC-BM-002 P0 未登录返回 401', async () => {
    const res = await request(app)
      .post('/api/beatmaker/apply')
      .send(VALID_APPLICATION);
    expect(res.status).toBe(401);
  });

  it('TC-BM-003 P1 姓名过短（<2字）', async () => {
    const { token } = await createUser(app);
    const res = await request(app)
      .post('/api/beatmaker/apply')
      .set(authHeader(token))
      .send({ ...VALID_APPLICATION, real_name: '张' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('真实姓名');
  });

  it('TC-BM-004 P1 身份证号格式错误', async () => {
    const { token } = await createUser(app);
    const res = await request(app)
      .post('/api/beatmaker/apply')
      .set(authHeader(token))
      .send({ ...VALID_APPLICATION, id_card_no: 'INVALID123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('身份证号');
  });

  it('TC-BM-005 P1 作品集链接格式错误', async () => {
    const { token } = await createUser(app);
    const res = await request(app)
      .post('/api/beatmaker/apply')
      .set(authHeader(token))
      .send({ ...VALID_APPLICATION, portfolio_url: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('作品集链接');
  });

  it('TC-BM-006 P1 简介过短（<20字）', async () => {
    const { token } = await createUser(app);
    const res = await request(app)
      .post('/api/beatmaker/apply')
      .set(authHeader(token))
      .send({ ...VALID_APPLICATION, bio: '太短了' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('个人简介');
  });

  it('TC-BM-007 P1 重复提交（已有 pending 申请）', async () => {
    const { token } = await createUser(app);
    await request(app)
      .post('/api/beatmaker/apply')
      .set(authHeader(token))
      .send(VALID_APPLICATION);
    const res = await request(app)
      .post('/api/beatmaker/apply')
      .set(authHeader(token))
      .send(VALID_APPLICATION);
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('application_id');
  });

  it('TC-BM-008 P1 已是 Beatmaker 无法申请', async () => {
    const { userId, email, token } = await createUser(app);
    const db = getDatabaseClient();
    // 直接把用户设为 beatmaker（绕过审核流程）
    await db.execute('UPDATE users SET is_beatmaker = 1 WHERE id = ?', [userId]);
    const res = await request(app)
      .post('/api/beatmaker/apply')
      .set(authHeader(token))
      .send(VALID_APPLICATION);
    await db.execute('UPDATE users SET is_beatmaker = 0 WHERE id = ?', [userId]);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('已经是');
  });
});

describe('Beatmaker 申请状态 - GET /api/beatmaker/application/me', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => { app = createApp(); });
  afterAll(() => cleanupTestUsers());

  it('TC-BM-009 P0 无申请时返回 null', async () => {
    const { token } = await createUser(app);
    const res = await request(app)
      .get('/api/beatmaker/application/me')
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.application).toBeNull();
  });

  it('TC-BM-010 P0 提交后能查到申请', async () => {
    const { token } = await createUser(app);
    await request(app)
      .post('/api/beatmaker/apply')
      .set(authHeader(token))
      .send(VALID_APPLICATION);
    const res = await request(app)
      .get('/api/beatmaker/application/me')
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.application).not.toBeNull();
    expect(res.body.application.status).toBe('pending');
    expect(res.body.application.real_name).toBe('张三');
    expect(res.body.application.id_card_masked).toBeTruthy();
  });
});

describe('Beatmaker 公开档案 - GET /api/beatmaker/profile/:userId', () => {
  let app: ReturnType<typeof createApp>;
  let beatmakerUserId = 0;

  beforeAll(async () => {
    app = createApp();
    const { userId, token } = await createUser(app);
    beatmakerUserId = userId;
    const db = getDatabaseClient();
    await db.execute(
      'INSERT INTO beatmaker_profiles (user_id, display_name, bio, portfolio_url, certified_at) VALUES (?, ?, ?, ?, NOW())',
      [beatmakerUserId, 'Test Beatmaker', '测试简介', 'https://example.com']
    );
    await db.execute('UPDATE users SET is_beatmaker = 1 WHERE id = ?', [beatmakerUserId]);
  });
  afterAll(() => cleanupTestUsers());

  it('TC-BM-011 P0 已有档案返回正确信息', async () => {
    const res = await request(app).get(`/api/beatmaker/profile/${beatmakerUserId}`);
    expect(res.status).toBe(200);
    expect(res.body.profile).not.toBeNull();
    expect(res.body.profile.user_id).toBe(beatmakerUserId);
    expect(res.body.profile.display_name).toBe('Test Beatmaker');
  });

  it('TC-BM-012 P1 不存在的用户返回 404', async () => {
    const res = await request(app).get('/api/beatmaker/profile/999999');
    expect(res.status).toBe(404);
  });
});

describe('Beatmaker 列表 - GET /api/beatmaker/list', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => { app = createApp(); });

  it('TC-BM-013 P0 返回数组结构', async () => {
    const res = await request(app).get('/api/beatmaker/list');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.beatmakers)).toBe(true);
  });

  it('TC-BM-014 P2 支持 limit 参数', async () => {
    const res = await request(app).get('/api/beatmaker/list?limit=2');
    expect(res.status).toBe(200);
    expect(res.body.beatmakers.length).toBeLessThanOrEqual(2);
  });
});

describe('Admin 审核列表 - GET /api/admin/beatmaker-applications', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken = '';

  beforeAll(async () => {
    app = createApp();
    ({ adminToken } = await createAdmin(app));
    const { token: userTk } = await createUser(app);
    await request(app)
      .post('/api/beatmaker/apply')
      .set(authHeader(userTk))
      .send(VALID_APPLICATION);
  });
  afterAll(() => cleanupTestUsers());

  it('TC-BM-015 P0 Admin 能获取列表', async () => {
    const res = await request(app)
      .get('/api/admin/beatmaker-applications')
      .set(authHeader(adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });

  it('TC-BM-016 P1 非 Admin 403', async () => {
    const { token } = await createUser(app);
    const res = await request(app)
      .get('/api/admin/beatmaker-applications')
      .set(authHeader(token));
    expect(res.status).toBe(403);
  });

  it('TC-BM-017 P1 按状态过滤', async () => {
    const res = await request(app)
      .get('/api/admin/beatmaker-applications?status=pending')
      .set(authHeader(adminToken));
    expect(res.status).toBe(200);
    for (const item of res.body.items) {
      expect(item.status).toBe('pending');
    }
  });
});

describe('Admin 审核操作 - POST approve/reject', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken = '';
  let applicationId = 0;

  beforeAll(async () => {
    app = createApp();
    ({ adminToken } = await createAdmin(app));
    const { token: userTk } = await createUser(app);
    const res = await request(app)
      .post('/api/beatmaker/apply')
      .set(authHeader(userTk))
      .send(VALID_APPLICATION);
    applicationId = res.body.application_id;
  });
  afterAll(() => cleanupTestUsers());

  it('TC-BM-018 P0 Admin 通过申请', async () => {
    const res = await request(app)
      .post(`/api/admin/beatmaker-applications/${applicationId}/approve`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('通过');
  });

  it('TC-BM-019 P1 已通过的申请不能重复通过', async () => {
    const res = await request(app)
      .post(`/api/admin/beatmaker-applications/${applicationId}/approve`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(409);
  });

  it('TC-BM-020 P0 Admin 拒绝申请（需理由≥5字）', async () => {
    // 先提交一个新申请
    const { token: userTk } = await createUser(app);
    const res = await request(app)
      .post('/api/beatmaker/apply')
      .set(authHeader(userTk))
      .send(VALID_APPLICATION);
    const id = res.body.application_id;
    const rejectRes = await request(app)
      .post(`/api/admin/beatmaker-applications/${id}/reject`)
      .set(authHeader(adminToken))
      .send({ reject_reason: '材料不符合要求，请补充更多信息' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.message).toContain('拒绝');
  });

  it('TC-BM-021 P1 拒绝理由过短返回 400', async () => {
    const { token: userTk } = await createUser(app);
    const res = await request(app)
      .post('/api/beatmaker/apply')
      .set(authHeader(userTk))
      .send(VALID_APPLICATION);
    const id = res.body.application_id;
    const rejectRes = await request(app)
      .post(`/api/admin/beatmaker-applications/${id}/reject`)
      .set(authHeader(adminToken))
      .send({ reject_reason: '不行' });
    expect(rejectRes.status).toBe(400);
  });
});
