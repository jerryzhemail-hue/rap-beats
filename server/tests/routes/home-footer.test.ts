/**
 * server/tests/routes/home-footer.test.ts
 * 首页 Footer 配置接口测试
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import homeFooterRouter from '../../src/routes/home-footer.js';
import authRouter from '../../src/routes/auth.js';
import request from 'supertest';
import { getDatabaseClient } from '../../src/database/client.js';
import { createAdmin, createUser, authHeader, cleanupTestUsers } from '../helpers.js';

function createApp() {
  const app = buildApp();
  app.use('/api', homeFooterRouter);
  app.use('/api/auth', authRouter);
  return app;
}

const VALID_FOOTER_CONFIG = {
  licenseCards: [
    { id: 'personal', icon: '🎧', title: '个人非商用', description: '个人练习用', ctaText: '了解', ctaUrl: '/vip', sortOrder: 1, isActive: true },
  ],
  creatorCta: { title: '招募 Beatmaker', subtitle: '加入我们', buttonText: '申请', buttonUrl: '/beatmaker/apply', isActive: true },
  stats: [
    { id: 'beats', label: 'Beat总数', value: '', auto: 'totalBeats', sortOrder: 1, isActive: true },
  ],
  links: [
    { id: 'beats', label: '发现Beat', url: '/beats', group: 'quick' },
  ],
  compliance: {
    copyrightText: '© 2026 Test',
    icp: '', icpUrl: '', police: '', policeUrl: '',
    email: 'test@test.com', emailLabel: '联系我们',
  },
  membershipSection: { isActive: true, title: '会员权益', subtitle: '' },
  rappersSection: { isActive: true, title: '热门制作人', subtitle: '', count: 6 },
  chartsSection: { isActive: true, title: '热门榜单', subtitle: '', count: 5 },
  subscribeSection: { isActive: true, title: '订阅通知', subtitle: '', buttonText: '订阅' },
};

describe('Home Footer 公开接口', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => { app = createApp(); });
  afterAll(() => cleanupTestUsers());

  it('TC-HF-001 P0 GET /home/footer 返回 config 结构', async () => {
    const res = await request(app).get('/api/home/footer');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('config');
    expect(res.body).toHaveProperty('faqs');
    expect(res.body).toHaveProperty('rappers');
    expect(res.body).toHaveProperty('charts');
    expect(res.body.charts).toHaveProperty('downloads');
    expect(res.body.charts).toHaveProperty('favorites');
    expect(res.body.charts).toHaveProperty('plays');
  });

  it('TC-HF-002 P0 POST /home/footer/subscribe 正常订阅', async () => {
    const email = `hf_test_${Date.now()}@test.com`;
    const res = await request(app)
      .post('/api/home/footer/subscribe')
      .send({ email });
    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();
  });

  it('TC-HF-003 P1 重复订阅返回成功（幂等）', async () => {
    const email = `hf_dup_${Date.now()}@test.com`;
    await request(app).post('/api/home/footer/subscribe').send({ email });
    const res = await request(app).post('/api/home/footer/subscribe').send({ email });
    expect(res.status).toBe(200);
  });

  it('TC-HF-004 P1 非法邮箱返回 400', async () => {
    const res = await request(app)
      .post('/api/home/footer/subscribe')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('邮箱');
  });
});

describe('Home Footer Admin 接口', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken = '';
  let userToken = '';

  beforeAll(async () => {
    app = createApp();
    ({ adminToken } = await createAdmin(app));
    ({ token: userToken } = await createUser(app));
  });
  afterAll(() => cleanupTestUsers());

  it('TC-HF-005 P0 Admin 能获取配置', async () => {
    const res = await request(app)
      .get('/api/admin/home-footer')
      .set(authHeader(adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('config');
  });

  it('TC-HF-006 P1 普通用户不能访问 admin 接口', async () => {
    const res = await request(app)
      .get('/api/admin/home-footer')
      .set(authHeader(userToken));
    expect(res.status).toBe(403);
  });

  it('TC-HF-007 P0 Admin 更新配置', async () => {
    const res = await request(app)
      .put('/api/admin/home-footer/config')
      .set(authHeader(adminToken))
      .send(VALID_FOOTER_CONFIG);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('config');
  });

  it('TC-HF-008 P0 Admin 新增 FAQ', async () => {
    const res = await request(app)
      .post('/api/admin/home-footer/faqs')
      .set(authHeader(adminToken))
      .send({ category: '测试', question: '如何申请？', answer: '登录后申请', sort_order: 1 });
    expect(res.status).toBe(201);
    expect(res.body.faq).toHaveProperty('id');
    return res.body.faq.id; // 供后续测试使用
  });

  it('TC-HF-009 P1 FAQ 缺少必填字段返回 400', async () => {
    const res = await request(app)
      .post('/api/admin/home-footer/faqs')
      .set(authHeader(adminToken))
      .send({ category: '测试' }); // 缺少 question/answer
    expect(res.status).toBe(400);
  });

  it('TC-HF-010 P0 Admin 列出订阅列表', async () => {
    const res = await request(app)
      .get('/api/admin/home-footer/subscriptions')
      .set(authHeader(adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('subscriptions');
    expect(Array.isArray(res.body.subscriptions)).toBe(true);
  });
});

describe('Home Footer FAQ CRUD', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken = '';
  let faqId = 0;

  beforeAll(async () => {
    app = createApp();
    ({ adminToken } = await createAdmin(app));
    // 创建一条 FAQ
    const res = await request(app)
      .post('/api/admin/home-footer/faqs')
      .set(authHeader(adminToken))
      .send({ category: '测试', question: '测试问题？', answer: '测试答案', sort_order: 0 });
    faqId = res.body.faq?.id ?? 0;
  });
  afterAll(() => cleanupTestUsers());

  it('TC-HF-011 P0 Admin 更新 FAQ', async () => {
    if (!faqId) return;
    const res = await request(app)
      .put(`/api/admin/home-footer/faqs/${faqId}`)
      .set(authHeader(adminToken))
      .send({ category: '测试', question: '更新后的问题？', answer: '更新后的答案', sort_order: 5 });
    expect(res.status).toBe(200);
    expect(res.body.faq.sort_order).toBe(5);
  });

  it('TC-HF-012 P1 不存在的 FAQ 返回 404', async () => {
    const res = await request(app)
      .put('/api/admin/home-footer/faqs/999999')
      .set(authHeader(adminToken))
      .send({ category: 'x', question: 'x', answer: 'x' });
    expect(res.status).toBe(404);
  });

  it('TC-HF-013 P0 Admin 删除 FAQ', async () => {
    if (!faqId) return;
    const res = await request(app)
      .delete(`/api/admin/home-footer/faqs/${faqId}`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(200);
  });
});
