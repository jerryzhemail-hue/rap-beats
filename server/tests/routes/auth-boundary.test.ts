/**
 * server/tests/routes/auth-boundary.test.ts
 * 认证边界测试：注册参数校验（P0/P1 边界）
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import authRouter from '../../src/routes/auth.js';
import request from 'supertest';
import { unique } from '../helpers.js';

function createApp() {
  const app = buildApp();
  app.use('/api/auth', authRouter);
  return app;
}

describe('认证边界 - 注册参数校验', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => { app = createApp(); });

  it('TC-AUTH-BOUNDARY-001 P1 用户名少于 3 字符返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'ab', email: `${unique('u')}@test.com`, password: 'Test@1234' });
    expect(res.status).toBe(400);
  });

  it('TC-AUTH-BOUNDARY-002 P1 用户名超 20 字符返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'a'.repeat(21), email: `${unique('u')}@test.com`, password: 'Test@1234' });
    expect(res.status).toBe(400);
  });

  it('TC-AUTH-BOUNDARY-003 P1 用户名含非法字符返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'bad name!', email: `${unique('u')}@test.com`, password: 'Test@1234' });
    expect(res.status).toBe(400);
  });

  it('TC-AUTH-BOUNDARY-004 P1 密码少于 6 位返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: unique('u'), email: `${unique('u')}@test.com`, password: '12345' });
    expect(res.status).toBe(400);
  });

  it('TC-AUTH-BOUNDARY-005 P1 邮箱格式错误返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: unique('u'), email: 'not-an-email', password: 'Test@1234' });
    expect(res.status).toBe(400);
  });

  it('TC-AUTH-BOUNDARY-006 P1 缺少必填字段返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: '', email: '', password: '' });
    expect(res.status).toBe(400);
  });
});
