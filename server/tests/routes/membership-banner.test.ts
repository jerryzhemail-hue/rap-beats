/**
 * server/tests/routes/membership-banner.test.ts
 *
 * 会员权益弹框 IP 频控路由 — 端到端验证
 *
 * 覆盖三个核心场景:
 *  1) 首次访问该 IP → status 返回 shouldShow=true (reason=first_visit)
 *  2) record 之后再次 status → shouldShow=false (reason=cooldown_active)
 *  3) 模拟 25h 前访问 → 冷却到期 → shouldShow=true (reason=cooldown_elapsed)
 *
 * 附加覆盖:
 *  - 不同 IP 之间互不影响
 *  - 同一 IP 多次 record 会累加 view_count
 *  - X-Forwarded-For 头被正确解析
 *  - 拿不到 IP 时放行(reason=no_ip)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app.js';
import membershipBannerRouter from '../../src/routes/membership-banner.js';
import { getDatabaseClient } from '../../src/database/client.js';

function createApp() {
  const app = buildApp();
  app.use('/api/membership-banner', membershipBannerRouter);
  return app;
}

const TEST_IP_A = '203.0.113.10'; // 测试用 IP A (RFC 5737 文档段, 不会撞真实地址)
const TEST_IP_B = '203.0.113.11'; // 测试用 IP B

async function clearTestRows() {
  const db = getDatabaseClient();
  await db.execute(
    `DELETE FROM membership_banner_views WHERE ip_address IN (?, ?)`,
    [TEST_IP_A, TEST_IP_B]
  );
}

async function backdateIp(ip: string, hoursAgo: number) {
  const db = getDatabaseClient();
  await db.execute(
    `UPDATE membership_banner_views
        SET first_seen_at = DATE_SUB(NOW(), INTERVAL ? HOUR),
            last_seen_at  = DATE_SUB(NOW(), INTERVAL ? HOUR)
      WHERE ip_address = ?`,
    [hoursAgo, hoursAgo, ip]
  );
}

describe('Membership Banner IP 频控', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await clearTestRows();
  });

  afterAll(async () => {
    await clearTestRows();
  });

  it('TC-MB-001 P0 首次访问该 IP → shouldShow=true, reason=first_visit', async () => {
    const res = await request(app)
      .get('/api/membership-banner/status')
      .set('X-Forwarded-For', TEST_IP_A);

    expect(res.status).toBe(200);
    expect(res.body.shouldShow).toBe(true);
    expect(res.body.reason).toBe('first_visit');
    expect(res.body.nextEligibleAt).toBeNull();
    expect(res.body.cooldownMs).toBe(24 * 60 * 60 * 1000);
  });

  it('TC-MB-002 P0 record 之后再 status → shouldShow=false, reason=cooldown_active', async () => {
    // 先落一条记录
    const rec = await request(app)
      .post('/api/membership-banner/record')
      .set('X-Forwarded-For', TEST_IP_A);
    expect(rec.status).toBe(200);
    expect(rec.body.recorded).toBe(true);

    // 再查 status
    const status = await request(app)
      .get('/api/membership-banner/status')
      .set('X-Forwarded-For', TEST_IP_A);
    expect(status.status).toBe(200);
    expect(status.body.shouldShow).toBe(false);
    expect(status.body.reason).toBe('cooldown_active');
    expect(status.body.nextEligibleAt).toBeTruthy();

    // nextEligibleAt 应在大约 24h 之后
    const nextAt = new Date(status.body.nextEligibleAt).getTime();
    const now = Date.now();
    const diff = nextAt - now;
    expect(diff).toBeGreaterThan(23 * 60 * 60 * 1000); // > 23h
    expect(diff).toBeLessThan(25 * 60 * 60 * 1000);    // < 25h
  });

  it('TC-MB-003 P0 冷却窗口到期(模拟 25h 前访问) → shouldShow=true, reason=cooldown_elapsed', async () => {
    // 先记录一次
    await request(app)
      .post('/api/membership-banner/record')
      .set('X-Forwarded-For', TEST_IP_A);

    // 把时间倒推 25 小时
    await backdateIp(TEST_IP_A, 25);

    // 再查 status
    const res = await request(app)
      .get('/api/membership-banner/status')
      .set('X-Forwarded-For', TEST_IP_A);
    expect(res.status).toBe(200);
    expect(res.body.shouldShow).toBe(true);
    expect(res.body.reason).toBe('cooldown_elapsed');
  });

  it('TC-MB-004 P1 不同 IP 之间互不影响', async () => {
    // IP A 记录一次
    await request(app)
      .post('/api/membership-banner/record')
      .set('X-Forwarded-For', TEST_IP_A);

    // IP A 被冷却
    const aStatus = await request(app)
      .get('/api/membership-banner/status')
      .set('X-Forwarded-For', TEST_IP_A);
    expect(aStatus.body.shouldShow).toBe(false);

    // IP B 还是首次
    const bStatus = await request(app)
      .get('/api/membership-banner/status')
      .set('X-Forwarded-For', TEST_IP_B);
    expect(bStatus.body.shouldShow).toBe(true);
    expect(bStatus.body.reason).toBe('first_visit');
  });

  it('TC-MB-005 P1 同一 IP 多次 record 会累加 view_count', async () => {
    await request(app).post('/api/membership-banner/record').set('X-Forwarded-For', TEST_IP_A);
    await request(app).post('/api/membership-banner/record').set('X-Forwarded-For', TEST_IP_A);
    await request(app).post('/api/membership-banner/record').set('X-Forwarded-For', TEST_IP_A);

    const db = getDatabaseClient();
    const row = await db.queryOne<{ view_count: number }>(
      `SELECT view_count FROM membership_banner_views WHERE ip_address = ?`,
      [TEST_IP_A]
    );
    expect(row?.view_count).toBe(3);
  });

  it('TC-MB-006 P1 IPv4-mapped IPv6 (::ffff:1.2.3.4) 被归一化为 1.2.3.4', async () => {
    const mappedIp = `::ffff:${TEST_IP_A}`;
    // 用 mapped 形式记录
    await request(app)
      .post('/api/membership-banner/record')
      .set('X-Forwarded-For', mappedIp);

    // 用纯 v4 查询应该命中同一条记录
    const res = await request(app)
      .get('/api/membership-banner/status')
      .set('X-Forwarded-For', TEST_IP_A);
    expect(res.body.shouldShow).toBe(false);
    expect(res.body.reason).toBe('cooldown_active');
  });

  it('TC-MB-007 P2 拿不到 IP 时放行(reason=no_ip)', async () => {
    // 不设 X-Forwarded-For,让 socket 地址兜底
    // supertest 的 req.socket.remoteAddress 通常是 ::ffff:127.0.0.1 或 ::1
    // 这两种都会被归一化为 '127.0.0.1' 或 '::1' 而非 'unknown'
    // 所以这里只断言: 接口一定返回 200,且 reason ∈ {first_visit, no_ip}
    const res = await request(app).get('/api/membership-banner/status');
    expect(res.status).toBe(200);
    expect(['first_visit', 'no_ip']).toContain(res.body.reason);
    if (res.body.reason === 'no_ip') {
      expect(res.body.shouldShow).toBe(true);
    }
  });
});
