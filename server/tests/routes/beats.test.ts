/**
 * server/tests/routes/beats.test.ts
 * Beats 首页多模块接口测试
 * - GET /home/public  (rappers / forumPosts)
 * - GET /beats  (筛选)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import beatsRouter from '../../src/routes/beats.js';
import request from 'supertest';

function createApp() {
  const app = buildApp();
  app.use('/api', beatsRouter);
  return app;
}

describe('Beats 首页公开接口', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => { app = createApp(); });

  it('TC-BEATS-001 P0 GET /home/public 返回多模块结构', async () => {
    const res = await request(app).get('/api/home/public');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('latest');
    expect(res.body).toHaveProperty('popular');
    expect(res.body).toHaveProperty('free');
    expect(res.body).toHaveProperty('rappers');
    expect(res.body).toHaveProperty('forumPosts');
    expect(Array.isArray(res.body.rappers)).toBe(true);
    expect(Array.isArray(res.body.forumPosts)).toBe(true);
  });

  it('TC-BEATS-002 P1 rappers 包含必要字段', async () => {
    const res = await request(app).get('/api/home/public');
    if (res.body.rappers.length > 0) {
      const r = res.body.rappers[0];
      expect(r).toHaveProperty('id');
      expect(r).toHaveProperty('name');
      expect(r).toHaveProperty('avatar_url');
      expect(r).toHaveProperty('bio');
      expect(r).toHaveProperty('beat_count');
    }
  });

  it('TC-BEATS-003 P1 forumPosts 包含必要字段', async () => {
    const res = await request(app).get('/api/home/public');
    if (res.body.forumPosts.length > 0) {
      const p = res.body.forumPosts[0];
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('title');
      expect(p).toHaveProperty('view_count');
    }
  });
});

describe('Beats 列表筛选 - GET /beats', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => { app = createApp(); });

  it('TC-BEATS-004 P0 无任何筛选参数正常返回', async () => {
    const res = await request(app).get('/api/beats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('beats');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
  });

  it('TC-BEATS-005 P2 免费筛选 is_free=1', async () => {
    const res = await request(app).get('/api/beats?is_free=1');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.beats)).toBe(true);
  });

  it('TC-BEATS-006 P2 多参数组合筛选', async () => {
    const res = await request(app).get('/api/beats?is_free=1&sort=newest&limit=3');
    expect(res.status).toBe(200);
    expect(res.body.beats.length).toBeLessThanOrEqual(3);
  });
});

describe('Beats 分页参数边界', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => { app = createApp(); });

  it('TC-BEATS-BOUNDARY-001 P1 limit=0 回退默认分页', async () => {
    const res = await request(app).get('/api/beats?limit=0');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.beats)).toBe(true);
    expect(res.body.beats.length).toBeLessThanOrEqual(12); // 默认 12
  });

  it('TC-BEATS-BOUNDARY-002 P1 limit 超上限被 clamp 到 100', async () => {
    const res = await request(app).get('/api/beats?limit=1000');
    expect(res.status).toBe(200);
    expect(res.body.beats.length).toBeLessThanOrEqual(100);
  });

  it('TC-BEATS-BOUNDARY-003 P1 limit 非数字回退默认', async () => {
    const res = await request(app).get('/api/beats?limit=abc');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.beats)).toBe(true);
  });

  it('TC-BEATS-BOUNDARY-004 P1 page 超出范围返回空列表', async () => {
    const res = await request(app).get('/api/beats?page=999');
    expect(res.status).toBe(200);
    expect(res.body.beats).toEqual([]);
  });

  it('TC-BEATS-BOUNDARY-005 P1 page 负数/非数字 clamp 到 1', async () => {
    const r1 = await request(app).get('/api/beats?page=-5');
    const r2 = await request(app).get('/api/beats?page=abc');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body.page).toBe(1);
    expect(r2.body.page).toBe(1);
  });
});
