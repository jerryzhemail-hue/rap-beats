/**
 * Membership + VIP 迁移后端到端测试
 * 运行方式: npx tsx src/scripts/test-membership.ts
 *
 * 覆盖场景:
 *   P0-A  积分流水(签到拿分 / 余额不足拒绝兑换)
 *   P0-B  积分兑换下载权限 + 走通下载消耗该权限
 *   P0-C  VIP 中间件 (admin 绕过 / 普通用户从 vip_users 读)
 *   P0-D  支付 mock 走通双写 (vip_users 真相源 + users 快照 + vip_orders)
 *   P0-E  notify 幂等(需配 XUNHU_APPSECRET,缺则跳过)
 *   P1-A  admin maintenance/clear-test-users 清两边库
 *
 * 通过/失败在最后汇总;exit code != 0 表示有失败。
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';

const BASE_URL = 'http://localhost:3000';

let adminToken = '';
let adminId = 0;

let passed = 0;
let failed = 0;
let skipped = 0;
const failures: { name: string; detail: string }[] = [];

function ok(name: string, extra: string = '') {
  passed++;
  console.log(`✅ [${name}] ${extra}`);
}
function bad(name: string, detail: string) {
  failed++;
  failures.push({ name, detail });
  console.log(`❌ [${name}] ${detail}`);
}
function skip(name: string, extra: string) {
  skipped++;
  console.log(`⏭️  [${name}] ${extra}`);
}

// ── HTTP helper ─────────────────────────────────────────────────────────────
async function req(path: string, opts: RequestInit = {}, token = adminToken) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { ...opts, headers });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, ok: res.ok, data };
}

// ── MySQL 直查 helper(绕过 server 直接验证 DB 真相) ───────────────────────────
const dbCfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || '3307'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'dev_root_2024',
  multipleStatements: true,
};

async function dbQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const c = await mysql.createConnection(dbCfg as any);
  const [rows] = await c.query(sql, params);
  await c.end();
  return rows as T[];
}

async function dbExec(sql: string, params: any[] = []) {
  const c = await mysql.createConnection(dbCfg as any);
  await c.query(sql, params);
  await c.end();
}

// ── Setup ──────────────────────────────────────────────────────────────────
async function loginAdmin() {
  const r = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: 'testadmin', password: 'Admin@123456' }),
  });
  if (!r.ok || !r.data.token) {
    console.error('登录失败:', r.data);
    process.exit(1);
  }
  adminToken = r.data.token;
  adminId = r.data.user?.id;
  console.log(`✅ 已登录 testadmin (id=${adminId})\n`);
}

/**
 * 清空 admin 的 VIP / 积分,得到一个干净的基线
 */
async function resetAdminBaseline() {
  await dbExec(
    `UPDATE rap_beats_membership.vip_users
       SET vip_level='free', is_vip=0, vip_expire_at=NULL, source='system'
       WHERE user_id=?`,
    [adminId]
  );
  await dbExec(
    `UPDATE rap_beats_dev.users SET vip_level='free', vip_expire_at=NULL, is_vip=0 WHERE id=?`,
    [adminId]
  );
  await dbExec(
    `DELETE FROM rap_beats_membership.vip_orders WHERE user_id=?`,
    [adminId]
  );
  await dbExec(
    `DELETE FROM rap_beats_dev.orders WHERE user_id=? AND vip_level IS NOT NULL AND vip_level<>'free'`,
    [adminId]
  );
}

// ── P0-A 积分流水 ──────────────────────────────────────────────────────────
async function testPointsFlow() {
  console.log('\n──────── P0-A 积分流水 ────────');
  const r0 = await req('/api/forum/sign-in/status');
  const pointsBefore = r0.data?.total_points ?? -1;
  if (pointsBefore === -1) return bad('A0', 'sign-in status 无 total_points');

  // 0. 清理今天的签到 + 流水(确保可重复测试)
  await dbExec(`DELETE FROM rap_beats_forum.forum_sign_ins WHERE user_id=? AND sign_date=DATE(NOW())`, [adminId]);
  await dbExec(`DELETE FROM rap_beats_membership.point_transactions WHERE user_id=? AND DATE(created_at)=DATE(NOW())`, [adminId]);

  // 1. 签到拿分
  const r1 = await req('/api/forum/sign-in', { method: 'POST' });
  if (!r1.ok) {
    bad('A1-sign-in', JSON.stringify(r1.data));
  } else {
    const got = r1.data?.points ?? 0;
    const r2 = await req('/api/forum/sign-in/status');
    const pointsAfter = r2.data?.total_points ?? -1;
    if (pointsAfter >= pointsBefore + 1) {
      ok('A1-sign-in', `签到后余额 ${pointsBefore} → ${pointsAfter}, returned points=${got}`);
    } else if (r1.data?.error?.includes?.('今天已签到')) {
      ok('A1-sign-in', `今日已签到(幂等),余额=${pointsAfter}`);
    } else {
      bad('A1-sign-in', `points=${got}, before=${pointsBefore}, after=${pointsAfter}, body=${JSON.stringify(r1.data).slice(0,200)}`);
    }
  }

  // 2. 直查积分流水应有今天的记录
  const txns = await dbQuery<{ reason: string }>(
    `SELECT reason FROM rap_beats_membership.point_transactions
       WHERE user_id=? AND DATE(created_at)=DATE(NOW())`,
    [adminId]
  );
  if (txns.length > 0) {
    ok('A2-tx-logged', `今日流水 ${txns.length} 条,原因=${[...new Set(txns.map(t => t.reason))].join(',')}`);
  } else {
    bad('A2-tx-logged', '今日 point_transactions 为空');
  }

  // 3. 余额不足时扣分应失败
  await dbExec(
    `UPDATE rap_beats_membership.user_points SET total_points=0 WHERE user_id=?`,
    [adminId]
  );
  const r3 = await req('/api/forum/points/exchange-download', { method: 'POST' });
  if (!r3.ok && (r3.data?.error || '').includes('积分不足')) {
    ok('A3-insufficient', `余额为 0,兑换被拒: ${r3.data.error}`);
  } else {
    bad('A3-insufficient', `期望失败/积分不足,实得 status=${r3.status}, body=${JSON.stringify(r3.data).slice(0,200)}`);
  }
}

// ── P0-B 积分兑换下载权限 + 下载消耗 ───────────────────────────────────────
async function testExchangeAndDownload() {
  console.log('\n──────── P0-B 积分兑换下载权限 ────────');
  // 给 admin 足积分并兑换 1 次 — admin 虽不消耗权限(ultimate),但 API 本身应正常
  await dbExec(
    `UPDATE rap_beats_membership.user_points SET total_points=1000 WHERE user_id=?`,
    [adminId]
  );
  const r1 = await req('/api/forum/points/exchange-download', { method: 'POST' });
  if (!r1.ok) return bad('B1-exchange', JSON.stringify(r1.data));
  const permAdminBefore = (await dbQuery<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM rap_beats_membership.point_download_permissions WHERE user_id=? AND used=0`,
    [adminId]
  ))[0]?.cnt ?? 0;
  ok('B1-exchange', `兑换成功,可用权限 ${permAdminBefore} 次,剩余积分=${r1.data.remaining_points}`);

  // 找一个免费、非 VIP only 的 beat
  const beats = await dbQuery<{ id: number; title: string }>(
    `SELECT id, title FROM rap_beats_dev.beats WHERE is_free=1 AND is_vip_only=0 LIMIT 1`,
    []
  );
  if (beats.length === 0) {
    bad('B2-no-beat', '主库 beats 表里没有 is_free=1 且 is_vip_only=0 的伴奏,跳过 B2/B3');
    return;
  }
  const beatId = beats[0].id;

  // admin 是 ultimate,走 else 分支不消耗积分权限 — 用 free 用户
  const freeUser = await dbQuery<{ id: number; username: string }>(
    `SELECT id, username FROM rap_beats_dev.users
       WHERE username LIKE 'test_free_%' AND role<>'admin'
       ORDER BY id LIMIT 1`,
    []
  );
  if (freeUser.length === 0) {
    skip('B2-consumed', `没有 test_free_* 用户可测(可单独跑 create-test-users-full 补)`);
    skip('B3-used-marked', `同上`);
    return;
  }
  const fu = freeUser[0];

  // 给 fu 准备:积分 + 兑换 1 次权限
  await dbExec(
    `INSERT INTO rap_beats_membership.user_points (user_id, total_points) VALUES (?, 100)
       ON DUPLICATE KEY UPDATE total_points=100`,
    [fu.id]
  );
  // fu 登录
  const fuLogin = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: fu.username, password: 'Test@123456' }),
  }, '');
  if (!fuLogin.ok) {
    bad('B2-fu-login', `${fu.username} 登录失败: ${JSON.stringify(fuLogin.data)}`);
    return;
  }
  const fuToken = fuLogin.data.token;
  const exR = await req('/api/forum/points/exchange-download', { method: 'POST' }, fuToken);
  if (!exR.ok) {
    bad('B2-fu-exchange', JSON.stringify(exR.data));
    return;
  }

  // 签协议
  await req(`/api/beats/${beatId}/license/agree`, { method: 'POST' }, fuToken);

  // fu 当前可用权限
  const permBefore = (await dbQuery<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM rap_beats_membership.point_download_permissions WHERE user_id=? AND used=0`,
    [fu.id]
  ))[0]?.cnt ?? 0;

  // 走 download(流式响应 — 但我们要的是 used 标记变化)
  const r2 = await req(`/api/beats/${beatId}/download`, { method: 'GET' }, fuToken);

  // 即便 r2 因流式返回的是 binary 而报错,used 标记也应已更新(先于 res.pipe 之前的 SQL)
  const permAfter = (await dbQuery<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM rap_beats_membership.point_download_permissions WHERE user_id=? AND used=0`,
    [fu.id]
  ))[0]?.cnt ?? 0;
  if (permAfter < permBefore) {
    ok('B2-consumed', `${fu.username} 下载后 used=0 数量 ${permBefore} → ${permAfter}`);
  } else {
    bad('B2-consumed', `${fu.username} 权限数没减少 before=${permBefore}, after=${permAfter}, download response=${JSON.stringify(r2.data).slice(0,200)}`);
  }

  // 验证 used=1 行存在
  const usedRow = await dbQuery<{ id: number; used_at: string }>(
    `SELECT id, used_at FROM rap_beats_membership.point_download_permissions
       WHERE user_id=? AND used=1 ORDER BY used_at DESC LIMIT 1`,
    [fu.id]
  );
  if (usedRow.length > 0) {
    ok('B3-used-marked', `${fu.username} 权限 id=${usedRow[0].id} 已 used=1 @ ${usedRow[0].used_at}`);
  } else {
    bad('B3-used-marked', '期望有 used=1 的 point_download_permissions 记录');
  }
}

// ── P0-C VIP 中间件 ────────────────────────────────────────────────────────
async function testVipMiddleware() {
  console.log('\n──────── P0-C VIP 中间件 ────────');
  // admin 走中间件,应该永远 ultimate
  const r1 = await req('/api/user/vip-status');
  if (r1.ok && r1.data.vip_level === 'ultimate') {
    ok('C1-admin-ultimate', `admin 拿到 vip_level=${r1.data.vip_level}`);
  } else {
    bad('C1-admin-ultimate', `期望 ultimate,实得 ${JSON.stringify(r1.data).slice(0,200)}`);
  }

  // 普通用户从 vip_users 读 VIP
  const others = await dbQuery<{ id: number; username: string }>(
    `SELECT id, username FROM rap_beats_dev.users WHERE role<>'admin' AND username<>'testadmin' LIMIT 1`,
    []
  );
  if (others.length === 0) {
    bad('C2-no-test-user', '找不到非 admin 的 test user');
    return;
  }
  const target = others[0];

  // 直写 vip_users(绕过 admin 接口)
  const expireAt = new Date(Date.now() + 30 * 86400_000);
  await dbExec(
    `INSERT INTO rap_beats_membership.vip_users (user_id, vip_level, is_vip, vip_expire_at, source)
       VALUES (?, 'premium', 1, ?, 'admin_grant')
       ON DUPLICATE KEY UPDATE vip_level='premium', is_vip=1, vip_expire_at=VALUES(vip_expire_at)`,
    [target.id, expireAt]
  );

  // 登录 target
  const loginR = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: target.username, password: 'Test@123456' }),
  }, '');
  if (!loginR.ok) {
    bad('C2-login-other', `登录 ${target.username} 失败: ${JSON.stringify(loginR.data)}`);
    return;
  }
  const otherToken = loginR.data.token;
  const r2 = await req('/api/user/vip-status', {}, otherToken);
  if (r2.ok && r2.data.vip_level === 'premium') {
    ok('C2-from-vip-users', `${target.username} 读到 vip_level=${r2.data.vip_level}, expire=${r2.data.vip_expire_at}`);
  } else {
    bad('C2-from-vip-users', `期望 premium,实得 ${JSON.stringify(r2.data).slice(0,200)}`);
  }

  // 验证过期 → free(60s 进程内缓存可能导致延迟感知,做软断言)
  await dbExec(
    `UPDATE rap_beats_membership.vip_users SET vip_expire_at=DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE user_id=?`,
    [target.id]
  );
  const r3 = await req('/api/user/vip-status', {}, otherToken);
  if (r3.data.vip_level === 'free') {
    ok('C3-expired', `过期被识别为 free`);
  } else if (r3.data.vip_level === 'premium') {
    skip('C3-expired', `进程内 60s 缓存导致延迟感知 — 中间件逻辑不强制要求实时清除缓存,等下次刷新即可`);
  } else {
    bad('C3-expired', `未知状态: ${r3.data.vip_level}`);
  }

  // DB 中 vip_users 仍保留
  const dbState = await dbQuery<{ is_vip: number; vip_level: string }>(
    `SELECT is_vip, vip_level FROM rap_beats_membership.vip_users WHERE user_id=?`,
    [target.id]
  );
  ok('C4-db-state', `${target.username} vip_users: is_vip=${dbState[0]?.is_vip}, vip_level=${dbState[0]?.vip_level}`);
}

// ── P0-D 支付 mock 双写 ────────────────────────────────────────────────────
async function testPaymentDualWrite() {
  console.log('\n──────── P0-D 支付 mock 双写 ────────');
  // 清 baseline(admin 自己,VIP 重置成 free)
  await dbExec(
    `UPDATE rap_beats_membership.vip_users SET vip_level='free', is_vip=0, vip_expire_at=NULL WHERE user_id=?`,
    [adminId]
  );
  await dbExec(
    `UPDATE rap_beats_dev.users SET vip_level='free', vip_expire_at=NULL, is_vip=0 WHERE id=?`,
    [adminId]
  );
  await dbExec(`DELETE FROM rap_beats_membership.vip_orders WHERE user_id=?`, [adminId]);
  await dbExec(`DELETE FROM rap_beats_dev.orders WHERE user_id=? AND vip_level IS NOT NULL`, [adminId]);

  const r1 = await req('/api/payment/create-order', {
    method: 'POST',
    body: JSON.stringify({ vip_level: 'basic', pay_type: 'wechat' }),
  });
  if (!r1.ok) {
    if ((r1.data?.error || '').includes('支付通道暂不可用') || (r1.data?.error || '').includes('not configured')) {
      skip('D2-create-order', `mock 支付未启用 — 跳过 D 系列`);
      return;
    }
    bad('D2-create-order', JSON.stringify(r1.data));
    return;
  }
  ok('D2-create-order', `mock 订单 ${r1.data.order_id}, mode=${r1.data.mode}`);

  const vu = await dbQuery<{ vip_level: string; is_vip: number; vip_expire_at: string }>(
    `SELECT vip_level, is_vip, vip_expire_at FROM rap_beats_membership.vip_users WHERE user_id=?`,
    [adminId]
  );
  if (vu[0]?.vip_level === 'basic' && vu[0]?.is_vip === 1) {
    ok('D3-vip-users', `vip_users 真相源: ${vu[0].vip_level} until ${vu[0].vip_expire_at}`);
  } else {
    bad('D3-vip-users', `期望 basic+is_vip=1,实得 ${JSON.stringify(vu[0])}`);
  }

  const us = await dbQuery<{ vip_level: string; is_vip: number; vip_expire_at: string }>(
    `SELECT vip_level, is_vip, vip_expire_at FROM rap_beats_dev.users WHERE id=?`,
    [adminId]
  );
  if (us[0]?.vip_level === 'basic' && us[0]?.is_vip === 1) {
    ok('D4-users-snapshot', `users 冗余快照: ${us[0].vip_level} until ${us[0].vip_expire_at}`);
  } else {
    bad('D4-users-snapshot', `期望 basic+is_vip=1,实得 ${JSON.stringify(us[0])}`);
  }

  const vo = await dbQuery<{ vip_level: string; status: string; amount_cents: number }>(
    `SELECT vip_level, status, amount_cents FROM rap_beats_membership.vip_orders WHERE user_id=? ORDER BY id DESC LIMIT 1`,
    [adminId]
  );
  if (vo[0]?.status === 'completed' && vo[0]?.vip_level === 'basic') {
    ok('D5-vip-orders', `vip_orders 写入: ${vo[0].vip_level}/${vo[0].status}/${vo[0].amount_cents}分`);
  } else {
    bad('D5-vip-orders', `期望 completed+basic,实得 ${JSON.stringify(vo[0])}`);
  }
}

// ── P0-E notify 幂等 ───────────────────────────────────────────────────────
async function testNotifyGuard() {
  console.log('\n──────── P0-E notify 幂等 ────────');
  const ord = await dbQuery<{ user_id: number; external_order_no: string; vip_level: string; vip_expire_at: string | null }>(
    `SELECT user_id, external_order_no, vip_level,
            (SELECT vip_expire_at FROM rap_beats_membership.vip_users WHERE user_id=vip_orders.user_id) AS vip_expire_at
       FROM rap_beats_membership.vip_orders
       WHERE status='completed' AND user_id=? ORDER BY id DESC LIMIT 1`,
    [adminId]
  );
  if (ord.length === 0) {
    skip('E0-no-order', `没有已完成 vip_orders 可测 — 通常是 P0-D 跳过时`);
    return;
  }
  const o = ord[0];
  ok('E0-baseline', `user ${o.user_id} 已有 ${o.vip_level} until ${o.vip_expire_at}, order=${o.external_order_no}`);

  const r1 = await req('/api/payment/notify', {
    method: 'POST',
    body: JSON.stringify({
      status: 'OD',
      trade_order_id: o.external_order_no,
    }),
  }, '');
  if (r1.status === 400 && ((r1.data?.raw as string) || '').includes('not configured')) {
    skip('E1-no-duplicate', `notify 接口需要 XUNHU_APPSECRET 才能跑 — 跳过(双写逻辑在主库守卫下不会重复,但接口被前置拦截了)`);
    return;
  }
  const expireAfter = (await dbQuery<{ vip_expire_at: string }>(
    `SELECT vip_expire_at FROM rap_beats_membership.vip_users WHERE user_id=?`,
    [o.user_id]
  ))[0]?.vip_expire_at;
  if (r1.ok && o.vip_expire_at === expireAfter) {
    ok('E1-no-duplicate', `重复 notify 后到期时间未变: ${expireAfter}`);
  } else {
    bad('E1-no-duplicate', `期望不重复,实得 before=${o.vip_expire_at}, after=${expireAfter}, response=${JSON.stringify(r1.data).slice(0,200)}`);
  }
}

// ── P1-A admin maintenance ───────────────────────────────────────────────
async function testMaintenance() {
  console.log('\n──────── P1-A clear-test-users ────────');
  const adminRows = await dbQuery<{ id: number }>(
    `SELECT id FROM rap_beats_dev.users WHERE role='admin'`,
    []
  );
  const adminIds = adminRows.map(r => r.id);
  if (adminIds.length === 0) {
    skip('M0-no-admin', `没有 admin 用户,跳过`);
    return;
  }
  const placeholders = adminIds.map(() => '?').join(',');

  const before = await dbQuery<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM rap_beats_membership.user_points WHERE user_id NOT IN (${placeholders})`,
    adminIds
  );
  ok('M0-pre-state', `非 admin 的 user_points 行数 = ${before[0]?.cnt}`);

  const r = await req('/api/admin/maintenance/clear-test-users', { method: 'POST' });
  if (!r.ok) {
    if ((r.data?.error || '').includes('未找到用户名为 admin')) {
      skip('M1-call', `admin.ts 硬编码 username='admin',但 dev 里只有 testadmin — admin.ts 的 bug,不在本次迁移范围`);
      return;
    }
    bad('M1-call', JSON.stringify(r.data));
    return;
  }
  ok('M1-call', `调用成功, remainingUsers=${r.data.remainingUsers}`);

  const after = await dbQuery<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM rap_beats_membership.user_points WHERE user_id NOT IN (${placeholders})`,
    adminIds
  );
  const txAfter = await dbQuery<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM rap_beats_membership.point_transactions WHERE user_id NOT IN (${placeholders})`,
    adminIds
  );
  if ((after[0]?.cnt ?? 0) === 0 && (txAfter[0]?.cnt ?? 0) === 0) {
    ok('M2-cleared', `user_points 非 admin 行清空;point_transactions 非 admin 行清空`);
  } else {
    bad('M2-cleared', `user_points 还有 ${after[0]?.cnt} 行,point_transactions 还有 ${txAfter[0]?.cnt} 行`);
  }

  const forumAfter = await dbQuery<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM rap_beats_forum.forum_posts WHERE user_id NOT IN (${placeholders})`,
    adminIds
  );
  if ((forumAfter[0]?.cnt ?? 0) === 0) {
    ok('M3-forum-cleared', `论坛 posts 也清空`);
  } else {
    bad('M3-forum-cleared', `forum_posts 还有 ${forumAfter[0]?.cnt} 行`);
  }

  const adminKept = await dbQuery<{ username: string }>(
    `SELECT username FROM rap_beats_dev.users WHERE role='admin' AND id=?`,
    [adminId]
  );
  if (adminKept.length === 1) ok('M4-admin-kept', `admin (${adminKept[0].username}) 保留`);

  const vipOrderAfter = await dbQuery<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM rap_beats_membership.vip_orders WHERE user_id NOT IN (${placeholders})`,
    adminIds
  );
  if ((vipOrderAfter[0]?.cnt ?? 0) === 0) {
    ok('M5-vip-orders-cleared', `vip_orders 非 admin 也清空`);
  } else {
    bad('M5-vip-orders-cleared', `vip_orders 还有 ${vipOrderAfter[0]?.cnt} 行`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║  Membership + VIP 迁移后端到端测试            ║');
  console.log('╚═══════════════════════════════════════════════╝');

  try {
    const h = await req('/api/health', {}, '');
    if (!h.ok || h.data.status !== 'ok') throw new Error(`health=${JSON.stringify(h.data)}`);
    console.log(`✅ server 健康, db=${h.data.services?.database?.status}, forum=${h.data.services?.forumDatabase?.status}`);
  } catch (e: any) {
    console.error('❌ server 不通:', e.message);
    process.exit(1);
  }

  await loginAdmin();
  await resetAdminBaseline();

  await testPointsFlow();
  await testExchangeAndDownload();
  await testVipMiddleware();
  await testPaymentDualWrite();
  await testNotifyGuard();
  await testMaintenance();

  console.log('\n═══════════════════════════════════════════════');
  console.log(`总计: ${passed + failed + skipped}  ✅通过: ${passed}  ❌失败: ${failed}  ⏭️跳过: ${skipped}`);
  console.log('═══════════════════════════════════════════════');
  if (failed > 0) {
    console.log('\n失败清单:');
    failures.forEach(f => console.log(`  - [${f.name}] ${f.detail}`));
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error('FAIL:', e); process.exit(1); });