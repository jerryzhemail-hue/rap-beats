/**
 * server/tests/helpers.ts
 * 测试辅助：创建测试用户，生成 token
 */
import request from 'supertest';
import type { Express } from 'express';
import { getDatabaseClient } from '../src/database/client.js';

export function unique(prefix = 'test') {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand.slice(0, 12)}`;
}

/** 注册一个新用户，返回 { body, token } */
export async function registerUser(
  app: Express,
  overrides: Partial<{ username: string; email: string; password: string }> = {}
) {
  const username = overrides.username ?? unique('user');
  const email = overrides.email ?? `${username}@test.com`;
  const password = overrides.password ?? 'Test@1234';
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username, email, password });
  const token = res.body.token ?? '';
  return { body: res.body, token, user: { id: res.body.user?.id, username, email, password } };
}

/** 登录用户，返回 { body, token } */
export async function loginUser(
  app: Express,
  loginValue: string,
  password: string
) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ login: loginValue, password });
  const token = res.body.token ?? '';
  return { body: res.body, token };
}

/** 用 Authorization Bearer header 认证（middleware/auth 的要求） */
export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** 把指定用户设为 admin，返回 { adminToken, adminEmail, adminUserId } */
export async function createAdmin(app: Express, overrides: { username?: string; email?: string } = {}) {
  const username = overrides.username ?? unique('adm');
  const email = overrides.email ?? `${username}@test.com`;
  const { body, token } = await registerUser(app, { username, email, password: 'Test@1234' });
  const db = getDatabaseClient();
  await db.execute("UPDATE users SET role = 'admin' WHERE email = ?", [email]);
  return { adminToken: token, adminEmail: email, adminUserId: body.user?.id ?? 0 };
}

/** 注册并返回 { token, userId, email } */
export async function createUser(app: Express, overrides: { username?: string; email?: string } = {}) {
  const username = overrides.username ?? unique('usr');
  const email = overrides.email ?? `${username}@test.com`;
  const { body, token } = await registerUser(app, { username, email, password: 'Test@1234' });
  return { token, userId: body.user?.id ?? 0, email };
}

/** 注册并立即设为 beatmaker */
export async function createBeatmakerUser(app: Express, overrides: { username?: string } = {}) {
  const u = await createUser(app, overrides);
  const db = getDatabaseClient();
  await db.execute('UPDATE users SET is_beatmaker = 1 WHERE id = ?', [u.userId]);
  return u;
}

/** 在数据库里把用户设为 beatmaker 认证状态 */
export async function makeUserBeatmaker(userId: number) {
  const db = getDatabaseClient();
  await db.execute(
    'UPDATE users SET is_beatmaker = 1, beatmaker_certified_at = NOW() WHERE id = ?',
    [userId]
  );
}

/** 清理测试用户（按 username 模糊匹配 test_/adm_/usr_ 前缀） */
export async function cleanupTestUsers() {
  const db = getDatabaseClient();
  await db.execute("DELETE FROM users WHERE username REGEXP '^(test|adm|usr)_'");
}
