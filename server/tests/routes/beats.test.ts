/**
 * server/tests/routes/beats.test.ts
 * Beats 首页多模块接口测试
 * - GET /home/public  (rappers / tags / forumPosts)
 * - GET /beats?tag=  (标签筛选)
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
    expect(res.body).toHaveProperty('tags');
    expect(res.body).toHaveProperty('forumPosts');
    expect(Array.isArray(res.body.rappers)).toBe(true);
    expect(Array.isArray(res.body.tags)).toBe(true);
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

  it('TC-BEATS-003 P1 tags 包含 tag 和 count', async () => {
    const res = await request(app).get('/api/home/public');
    if (res.body.tags.length > 0) {
      const t = res.body.tags[0];
      expect(t).toHaveProperty('tag');
      expect(t).toHaveProperty('count');
    }
  });

  it('TC-BEATS-004 P1 forumPosts 包含必要字段', async () => {
    const res = await request(app).get('/api/home/public');
    if (res.body.forumPosts.length > 0) {
      const p = res.body.forumPosts[0];
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('title');
      expect(p).toHaveProperty('view_count');
    }
  });
});

describe('Beats 标签筛选 - GET /beats?tag=', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => { app = createApp(); });

  it('TC-BEATS-005 P0 无 tag 参数正常返回', async () => {
    const res = await request(app).get('/api/beats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('beats');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
  });

  it('TC-BEATS-006 P2 tag 参数不报错', async () => {
    const res = await request(app).get('/api/beats?tag=Trap');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.beats)).toBe(true);
  });

  it('TC-BEATS-007 P2 多参数组合筛选', async () => {
    const res = await request(app).get('/api/beats?is_free=1&sort=newest&limit=3');
    expect(res.status).toBe(200);
    expect(res.body.beats.length).toBeLessThanOrEqual(3);
  });
});
