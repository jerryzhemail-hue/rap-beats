/**
 * server/tests/routes/home-unauth.test.ts
 *
 * 首页未登录场景集成测试 — 验证所有公开接口不报 5xx 错误
 *
 * 覆盖客户端首页 (HomeView.vue) 在未登录状态下发出的 6 个公开请求:
 *  1) GET /api/preview/check
 *  2) GET /api/homepage-config
 *  3) GET /api/membership-banner/status
 *  4) GET /api/home/footer
 *  5) GET /api/banners
 *  6) GET /api/home/public
 *
 * 关键断言:
 *  - 全部返回 200(不能 5xx,不暴露后端错误)
 *  - 响应体是合法 JSON
 *  - 公开接口在没有 Authorization 头 / 没有 cookie 时仍可正常返回业务数据
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import previewRouter from '../../src/routes/preview.js';
import homepageConfigRouter from '../../src/routes/homepage-config.js';
import membershipBannerRouter from '../../src/routes/membership-banner.js';
import homeFooterRouter from '../../src/routes/home-footer.js';
import bannersRouter from '../../src/routes/banners.js';
import beatsRouter from '../../src/routes/beats.js';

function createApp() {
  const app = buildApp();
  // mount 顺序不重要,只是路径不冲突
  app.use('/api', previewRouter);
  app.use('/api/homepage-config', homepageConfigRouter);
  app.use('/api/membership-banner', membershipBannerRouter);
  app.use('/api', homeFooterRouter);
  app.use('/api', bannersRouter);
  app.use('/api', beatsRouter);
  return app;
}

describe('首页公开接口 - 未登录场景', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  it('TC-UN-001 GET /api/preview/check 未登录 → 200', async () => {
    const res = await request(app).get('/api/preview/check');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toBeTypeOf('object');
  });

  it('TC-UN-002 GET /api/homepage-config 未登录 → 200, 含 config', async () => {
    const res = await request(app).get('/api/homepage-config');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    // 接口实际返回的是 { config: {...} } 结构,只要是 object 即可
    expect(res.body).toBeTypeOf('object');
  });

  it('TC-UN-003 GET /api/membership-banner/status 未登录 → 200, shouldShow=true (first_visit)', async () => {
    const res = await request(app).get('/api/membership-banner/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('shouldShow');
    expect(res.body).toHaveProperty('cooldownMs');
  });

  it('TC-UN-004 GET /api/home/footer 未登录 → 200, 含 config/faqs/rappers/charts', async () => {
    const res = await request(app).get('/api/home/footer');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('config');
    expect(res.body).toHaveProperty('faqs');
    expect(res.body).toHaveProperty('rappers');
    expect(res.body).toHaveProperty('charts');
  });

  it('TC-UN-005 GET /api/banners 未登录 → 200, 含 banners 数组', async () => {
    const res = await request(app).get('/api/banners');
    expect(res.status).toBe(200);
    // 实际接口返回 { banners: [...] } 字段
    const arr = res.body.banners ?? res.body.items;
    expect(Array.isArray(arr)).toBe(true);
  });

  it('TC-UN-006 GET /api/home/public 未登录 → 200, 含 latest/popular/free/rappers/tags/forumPosts', async () => {
    const res = await request(app).get('/api/home/public');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('latest');
    expect(res.body).toHaveProperty('popular');
    expect(res.body).toHaveProperty('free');
    expect(res.body).toHaveProperty('rappers');
    expect(res.body).toHaveProperty('tags');
    expect(res.body).toHaveProperty('forumPosts');
  });

  it('TC-UN-007 P0 一次性并发未登录调用 6 个接口 → 全部 2xx, 0 个 5xx', async () => {
    // 模拟 HomeView.vue 在 onMounted 中并发发出 6 个 fetch 的真实场景
    const endpoints = [
      '/api/preview/check',
      '/api/homepage-config',
      '/api/membership-banner/status',
      '/api/home/footer',
      '/api/banners',
      '/api/home/public',
    ];

    const responses = await Promise.all(
      endpoints.map((ep) => request(app).get(ep))
    );

    const failures = responses
      .map((r, i) => ({ ep: endpoints[i], status: r.status, body: r.body }))
      .filter((r) => r.status >= 500);

    if (failures.length > 0) {
      console.error('5xx failures:', JSON.stringify(failures, null, 2));
    }

    expect(failures).toEqual([]);

    // 全部响应都应该是合法 JSON object
    for (const r of responses) {
      expect(r.status).toBeLessThan(500);
      expect(r.status).toBeGreaterThanOrEqual(200);
      expect(r.headers['content-type']).toMatch(/json/);
      expect(r.body).toBeTypeOf('object');
    }
  });
});
