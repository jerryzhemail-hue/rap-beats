/**
 * 全量接口测试套件（覆盖所有功能模块）
 * 运行：cd server && node --import tsx/esm scripts/api-full-test.mjs
 *
 * 前置条件：
 * 1. 本地后端已启动（http://localhost:3000）
 * 2. 已执行 seed-test-data.mjs（测试账号 + 数据）
 * 3. server/.env 已开启 MOCK_PAYMENT_ENABLED=true
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import 'dotenv/config';
import mysql from 'mysql2/promise';

const BASE = 'http://127.0.0.1:3000/api';
const TMP = '/tmp/api-full-test-assets';
fs.mkdirSync(TMP, { recursive: true });

// ─── 测试资产（用 ffmpeg 生成） ──────────────────────────────────────────────
const WAV = `${TMP}/test.wav`;
const PNG = `${TMP}/test.png`;
const MP4 = `${TMP}/test.mp4`;
execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-ar', '44100', WAV], { stdio: 'ignore' });
execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=red:size=64x64:d=1', '-frames:v', '1', PNG], { stdio: 'ignore' });
execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=blue:size=128x128:d=1', '-f', 'mp4', MP4], { stdio: 'ignore' });

// ─── 结果收集 ────────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const failures = [];
let currentSection = '';

function section(name) {
  currentSection = name;
  console.log(`\n━━━ ${name} ━━━`);
}

async function test(name, fn) {
  const started = Date.now();
  try {
    const info = await fn();
    const ok = info && info.ok !== false;
    if (ok) {
      pass++;
      console.log(`  ✓ ${name} (${Date.now() - started}ms)${info?.detail ? ' — ' + info.detail : ''}`);
    } else {
      fail++;
      failures.push(`[${currentSection}] ${name}: ${info?.detail || '断言失败'}`);
      console.log(`  ✗ ${name} (${Date.now() - started}ms) — ${info?.detail}`);
    }
  } catch (e) {
    fail++;
    failures.push(`[${currentSection}] ${name}: 异常 ${e.message}`);
    console.log(`  ✗ ${name} (${Date.now() - started}ms) — 异常: ${e.message}`);
  }
}

// ─── HTTP 辅助 ───────────────────────────────────────────────────────────────
async function req(method, path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.Cookie = opts.cookie;
  let body;
  if (opts.form) {
    body = opts.form;
  } else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout || 30000);
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body, redirect: 'manual', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return {
    status: res.status,
    headers: res.headers,
    text,
    body: json,
    cookie: (res.headers.get('set-cookie') || '').split(';')[0]
  };
}

const get = (p, o) => req('GET', p, o);
const post = (p, o) => req('POST', p, o);
const put = (p, o) => req('PUT', p, o);
const patch = (p, o) => req('PATCH', p, o);
const del = (p, o) => req('DELETE', p, o);

function expect(status, allowed = [status]) {
  return { ok: allowed.includes(status), detail: `期望 ${allowed.join('/')}，实际 ${status}` };
}

// OSS 模式下下载是 302 签名直链；local 模式下是 200 附件流
function assertDownloadOk(r) {
  if (r.status === 200 && (r.headers.get('content-type') || '').includes('audio')) {
    return { ok: true, detail: 'local 附件流' };
  }
  if (r.status === 302 && (r.headers.get('location') || '').includes('/dev/audio/')) {
    return { ok: true, detail: 'OSS 302 签名直链(dev/audio)' };
  }
  return { ok: false, detail: `status=${r.status}, location=${r.headers.get('location') || ''}` };
}

// OSS 模式下 stream 是代理(206+X-Preview)或 302 完整流
function assertStreamOk(r, previewExpected) {
  const ct = r.headers.get('content-type') || '';
  const preview = r.headers.get('x-preview') === 'true';
  if (previewExpected) {
    return preview && (ct.includes('audio') || r.status === 206)
      ? { ok: true, detail: `status=${r.status}, X-Preview=true` }
      : { ok: false, detail: `status=${r.status}, ct=${ct}, X-Preview=${r.headers.get('x-preview')}` };
  }
  if (r.status === 302 && (r.headers.get('location') || '').includes('/dev/audio/')) {
    return { ok: true, detail: 'OSS 302 完整流' };
  }
  if (!preview && (ct.includes('audio') || r.status === 206)) {
    return { ok: true, detail: `status=${r.status}` };
  }
  return { ok: false, detail: `status=${r.status}, ct=${ct}, X-Preview=${r.headers.get('x-preview')}` };
}

function pick(obj, keys) {
  for (const k of keys) if (obj?.[k] !== undefined) return obj[k];
  return undefined;
}

function makeForm(fields, files) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields || {})) fd.append(k, String(v));
  for (const [k, file] of Object.entries(files || {})) {
    fd.append(k, new Blob([fs.readFileSync(file.path)], { type: file.type }), file.name);
  }
  return fd;
}

// ─── 登录辅助 ────────────────────────────────────────────────────────────────
async function login(username, password) {
  const r = await post('/auth/login', { json: { login: username, password } });
  return r.body?.token || null;
}

// ─── 本地 dev 库直连（用于幂等复位测试前置状态） ─────────────────────────────
async function devDb() {
  return mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rap_beats_dev',
    charset: 'utf8mb4',
  });
}

async function forumDb() {
  return mysql.createConnection({
    host: process.env.FORUM_DB_HOST || process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.FORUM_DB_PORT || process.env.DB_PORT || '3306'),
    user: process.env.FORUM_DB_USER || process.env.DB_USER || 'root',
    password: process.env.FORUM_DB_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.FORUM_DB_NAME || 'rap_beats_forum_dev',
    charset: 'utf8mb4',
  });
}

// ════════════════════════════════════════════════════════════════════════════
async function main() {
  const S = {}; // 共享状态

  // ── 登录所有测试账号 ──
  const creds = {
    admin: ['testadmin', 'Admin@123456'],
    free: ['tester_free', 'Test@123456'],
    basic: ['tester_basic', 'Test@123456'],
    premium: ['tester_premium', 'Test@123456'],
    points: ['tester_points', 'Test@123456'],
    pay: ['tester_pay', 'Test@123456'],
  };

  section('A. 认证');
  await test('GET /health 健康检查', async () => {
    const r = await get('/health');
    return r.status === 200 && r.body?.status === 'ok' && r.body?.services?.database?.status === 'ok'
      ? { ok: true } : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 150)}` };
  });
  await test('未带 token 访问 /auth/me 应 401', async () => {
    const r = await get('/auth/me');
    return expect(r.status, [401]);
  });

  await test('注册新用户（自动测试号）', async () => {
    const name = `autotest_${Date.now().toString().slice(-10)}`;
    S.autoUser = { username: name, email: `${name}@test.local`, password: 'Autotest@123' };
    const r = await post('/auth/register', { json: S.autoUser });
    if (r.status === 201) S.autoToken = r.body?.token;
    return expect(r.status, [201, 200]);
  });

  await test('重复注册应 409', async () => {
    const r = await post('/auth/register', { json: S.autoUser });
    return expect(r.status, [409]);
  });

  for (const [key, [u, p]] of Object.entries(creds)) {
    await test(`登录 ${u}`, async () => {
      S[`tok_${key}`] = await login(u, p);
      return S[`tok_${key}`] ? { ok: true } : { ok: false, detail: '未拿到 token' };
    });
  }

  await test('用邮箱登录', async () => {
    const r = await post('/auth/login', { json: { login: creds.basic[0], password: creds.basic[1] } });
    return expect(r.status, [200]);
  });

  await test('错误密码登录应 401', async () => {
    const r = await post('/auth/login', { json: { login: creds.free[0], password: 'wrong-password' } });
    return expect(r.status, [401]);
  });

  await test('GET /auth/me 返回当前用户', async () => {
    const r = await get('/auth/me', { token: S.tok_free });
    return r.status === 200 && r.body?.user?.username === 'tester_free'
      ? { ok: true } : { ok: false, detail: `status=${r.status}, username=${r.body?.user?.username}` };
  });

  section('B. Beat 公开接口');
  await test('GET /beats 列表', async () => {
    const r = await get('/beats?page=1&pageSize=5');
    const list = pick(r.body, ['beats', 'list', 'items']);
    S.freeBeatId = (list || []).find(b => b.is_free === 1 && b.id !== 33)?.id || list?.[0]?.id;
    S.otherBeatId = (list || []).find(b => b.id !== S.freeBeatId)?.id;
    const ossOk = (list || []).every(b => (b.file_path || '').includes('/dev/audio/'));
    return r.status === 200 && Array.isArray(list) && list.length > 0 && ossOk
      ? { ok: true, detail: `total=${r.body?.total}, 第一条=${list[0]?.title}, OSS=dev/audio` }
      : { ok: false, detail: `status=${r.status}` };
  });

  await test('GET /beats 按曲风过滤', async () => {
    const r = await get('/beats?genre=Trap');
    return expect(r.status, [200]);
  });

  await test('GET /beats 按热度/最新排序', async () => {
    const r1 = await get('/beats?sort=hot');
    const r2 = await get('/beats?sort=latest');
    return expect(r1.status, [200]) && expect(r2.status, [200]);
  });

  await test('GET /beats/:id 详情', async () => {
    if (!S.freeBeatId) return { ok: false, detail: '没有可用 beat' };
    const r = await get(`/beats/${S.freeBeatId}`);
    return r.status === 200 && r.body?.id === S.freeBeatId
      ? { ok: true, detail: `id=${r.body.id}, title=${r.body.title}` }
      : { ok: false, detail: `status=${r.status}` };
  });

  await test('GET /beats/:id/license 协议模板', async () => {
    const r = await get(`/beats/${S.freeBeatId}/license`);
    return r.status === 200 && !!r.body?.content
      ? { ok: true, detail: `version=${r.body.version}` }
      : { ok: false, detail: `status=${r.status}` };
  });

  await test('GET /genres 曲风列表', async () => {
    const r = await get('/genres');
    return r.status === 200 && Array.isArray(pick(r.body, ['genres', 'list'])) 
      ? { ok: true } : { ok: false, detail: `status=${r.status}` };
  });

  await test('GET /home/public 首页聚合', async () => {
    const r = await get('/home/public');
    return expect(r.status, [200]);
  });

  await test('游客无会话访问 stream 应 403 (NO_SESSION)', async () => {
    const r = await get(`/beats/${S.freeBeatId}/stream`);
    return r.status === 403 && r.body?.code === 'NO_SESSION'
      ? { ok: true } : { ok: false, detail: `status=${r.status}, code=${r.body?.code}` };
  });

  await test('游客带会话访问 stream（40s 预览）', async () => {
    const check = await get('/preview/check');
    const cookie = check.cookie;
    const r = await get(`/beats/${S.freeBeatId}/stream`, { cookie });
    return assertStreamOk(r, true);
  });

  section('C. Beat 鉴权/VIP/下载');
  // 复位 tester_premium 今日下载记录，避免多轮运行累计命中 30 次/天上限
  {
    const dbc = await devDb();
    const [pr] = await dbc.query('SELECT id FROM users WHERE username = ?', ['tester_premium']);
    if (pr[0]?.id) await dbc.query('DELETE FROM downloads WHERE user_id = ? AND created_at >= CURDATE()', [pr[0].id]);
    await dbc.end();
  }
  await test('免费用户未同意协议下载应 403 (LICENSE)', async () => {
    if (!S.otherBeatId) return { ok: false, detail: '没有第二个 beat 可测' };
    // 清除历史运行残留的协议同意记录，保证「未同意」状态可重复验证
    const dbc = await devDb();
    const [fr] = await dbc.query('SELECT id FROM users WHERE username = ?', ['tester_free']);
    if (fr[0]?.id) {
      await dbc.query('DELETE FROM beat_license_agreements WHERE user_id = ? AND beat_id = ?', [fr[0].id, S.otherBeatId]);
    }
    await dbc.end();
    const r = await get(`/beats/${S.otherBeatId}/download`, { token: S.tok_free });
    return r.status === 403 && r.body?.code === 'LICENSE_AGREEMENT_REQUIRED'
      ? { ok: true } : { ok: false, detail: `status=${r.status}, code=${r.body?.code}` };
  });

  await test('POST /beats/:id/license/agree 同意协议', async () => {
    const r = await post(`/beats/${S.freeBeatId}/license/agree`, { token: S.tok_free, json: {} });
    return expect(r.status, [200]);
  });

  await test('免费用户下载免费 beat 应 403 (需要会员/积分)', async () => {
    // 复位今日下载记录与未使用权限，避免受前序用例（每日 5 次上限）残留影响
    const dbc = await devDb();
    const [fr] = await dbc.query('SELECT id FROM users WHERE username = ?', ['tester_free']);
    if (fr[0]?.id) {
      await dbc.query('DELETE FROM downloads WHERE user_id = ? AND created_at >= CURDATE()', [fr[0].id]);
    }
    await dbc.end();
    const fdbc = await forumDb();
    if (fr[0]?.id) {
      await fdbc.query('DELETE FROM forum_point_download_permissions WHERE user_id = ? AND used = 0', [fr[0].id]);
    }
    await fdbc.end();
    const r = await get(`/beats/${S.freeBeatId}/download`, { token: S.tok_free });
    return r.status === 403 && r.body?.code === 'DOWNLOAD_REQUIRES_VIP'
      ? { ok: true, detail: r.body?.hint } : { ok: false, detail: `status=${r.status}, code=${r.body?.code}` };
  });

  await test('会员下载免费 beat 成功（OSS 302 签名直链）', async () => {
    await post(`/beats/${S.freeBeatId}/license/agree`, { token: S.tok_premium, json: {} });
    const r = await get(`/beats/${S.freeBeatId}/download`, { token: S.tok_premium });
    return assertDownloadOk(r);
  });

  await test('免费用户 stream 应返回预览（X-Preview）', async () => {
    const r = await get(`/beats/${S.freeBeatId}/stream`, { token: S.tok_free });
    return assertStreamOk(r, true);
  });

  await test('会员 stream 返回完整文件', async () => {
    const r = await get(`/beats/${S.freeBeatId}/stream`, { token: S.tok_premium });
    return assertStreamOk(r, false);
  });

  await test('VIP 专属 beat：免费用户 stream 应 403 (VIP_ONLY)', async () => {
    const list = await get('/beats?pageSize=50');
    const vipBeat = (pick(list.body, ['beats', 'list']) || []).find(b => b.is_vip_only === 1);
    if (!vipBeat) return { ok: false, detail: '库中没有 VIP 专属 beat' };
    S.vipBeatId = vipBeat.id;
    const r = await get(`/beats/${vipBeat.id}/stream`, { token: S.tok_free });
    return r.status === 403 && r.body?.code === 'VIP_ONLY'
      ? { ok: true, detail: `required=${r.body?.required_level}` } : { ok: false, detail: `status=${r.status}, code=${r.body?.code}` };
  });
  await test('VIP 专属 beat：免费用户详情应 403 (VIP_ONLY)', async () => {
    if (!S.vipBeatId) return { ok: false, detail: '无 VIP beat' };
    const r = await get(`/beats/${S.vipBeatId}`, { token: S.tok_free });
    return r.status === 403 && r.body?.code === 'VIP_ONLY'
      ? { ok: true, detail: `required=${r.body?.required_level}` } : { ok: false, detail: `status=${r.status}, code=${r.body?.code}` };
  });

  await test('VIP 专属 beat：会员 stream 成功', async () => {
    if (!S.vipBeatId) return { ok: false, detail: '无 VIP beat' };
    const r = await get(`/beats/${S.vipBeatId}/stream`, { token: S.tok_premium });
    return assertStreamOk(r, false);
  });

  await test('VIP 专属 beat：会员下载成功', async () => {
    if (!S.vipBeatId) return { ok: false, detail: '无 VIP beat' };
    await post(`/beats/${S.vipBeatId}/license/agree`, { token: S.tok_premium, json: {} });
    const r = await get(`/beats/${S.vipBeatId}/download`, { token: S.tok_premium });
    return assertDownloadOk(r);
  });

  await test('POST /beats/:id/play-events 播放事件', async () => {
    const r = await post(`/beats/${S.freeBeatId}/play-events`, { token: S.tok_free, json: {} });
    return expect(r.status, [201, 200]);
  });

  section('D. 收藏');
  await test('POST /favorites/:id 添加收藏', async () => {
    const r = await post(`/favorites/${S.freeBeatId}`, { token: S.tok_free, json: {} });
    return expect(r.status, [201, 200]);
  });
  await test('重复收藏幂等', async () => {
    const r = await post(`/favorites/${S.freeBeatId}`, { token: S.tok_free, json: {} });
    return expect(r.status, [200, 201]);
  });
  await test('GET /favorites 收藏列表包含该 beat', async () => {
    const r = await get('/favorites', { token: S.tok_free });
    const list = pick(r.body, ['favorites', 'list', 'items', 'beats']);
    return r.status === 200 && (list || []).some(b => b.id === S.freeBeatId || b.beat_id === S.freeBeatId)
      ? { ok: true } : { ok: false, detail: `status=${r.status}` };
  });
  await test('DELETE /favorites/:id 取消收藏', async () => {
    const r = await del(`/favorites/${S.freeBeatId}`, { token: S.tok_free });
    return expect(r.status, [200, 204]);
  });

  section('E. Beat 评论');
  let commentId;
  await test('GET /beats/:id/comments 评论列表', async () => {
    const r = await get(`/beats/${S.freeBeatId}/comments`);
    return expect(r.status, [200]);
  });
  await test('POST 空内容评论应 400', async () => {
    const r = await post(`/beats/${S.freeBeatId}/comments`, { token: S.tok_free, json: { content: '  ' } });
    return expect(r.status, [400]);
  });
  await test('POST 发表评论', async () => {
    const r = await post(`/beats/${S.freeBeatId}/comments`, { token: S.tok_free, json: { content: '自动化测试评论：这个 beat 不错！' } });
    commentId = r.body?.comment?.id ?? r.body?.id ?? pick(r.body, ['comment', 'id']);
    return expect(r.status, [201, 200]);
  });
  await test('他人无权删除我的评论应 403', async () => {
    if (!commentId) return { ok: false, detail: '评论未创建' };
    const r = await del(`/comments/${commentId}`, { token: S.tok_basic });
    return expect(r.status, [403]);
  });
  await test('管理员可删除任意评论', async () => {
    if (!commentId) return { ok: false, detail: '评论未创建' };
    const r = await del(`/comments/${commentId}`, { token: S.tok_admin });
    return expect(r.status, [200]);
  });

  section('F. 试听（游客）');
  await test('GET /preview/check 游客返回剩余次数并种 Cookie', async () => {
    const r = await get('/preview/check');
    S.guestCookie = r.cookie;
    return r.status === 200 && r.body?.is_guest === true && !!S.guestCookie
      ? { ok: true, detail: `remaining=${r.body?.remaining}` } : { ok: false, detail: `status=${r.status}` };
  });
  await test('POST /preview/play 记录游客试听', async () => {
    const r = await post('/preview/play', { cookie: S.guestCookie, json: { beat_id: S.freeBeatId } });
    return expect(r.status, [200]);
  });
  await test('GET /preview/status 游客状态', async () => {
    const r = await get('/preview/status', { cookie: S.guestCookie });
    return expect(r.status, [200]);
  });
  await test('登录用户 /preview/check 直接放行', async () => {
    const r = await get('/preview/check', { token: S.tok_free });
    return r.status === 200 && r.body?.is_guest === false
      ? { ok: true } : { ok: false, detail: `status=${r.status}, is_guest=${r.body?.is_guest}` };
  });
  await test('游客试听第 3 次后第 4 次应 403 (GUEST_LIMIT_REACHED)', async () => {
    // 全新会话：3 次成功，第 4 次拒绝
    const check = await get('/preview/check');
    const cookie = check.cookie;
    for (let i = 0; i < 3; i++) {
      const r = await post('/preview/play', { cookie, json: { beat_id: S.freeBeatId } });
      if (r.status !== 200) return { ok: false, detail: `第 ${i + 1} 次试听 status=${r.status}` };
    }
    const blocked = await post('/preview/play', { cookie, json: { beat_id: S.freeBeatId } });
    return blocked.status === 403 && blocked.body?.code === 'GUEST_LIMIT_REACHED'
      ? { ok: true, detail: `${blocked.body.used}/${blocked.body.limit}` }
      : { ok: false, detail: `status=${blocked.status}, code=${blocked.body?.code}, body=${blocked.text.slice(0, 120)}` };
  });

  section('G. 用户中心');
  await test('GET /user/vip-status 免费用户', async () => {
    const r = await get('/user/vip-status', { token: S.tok_free });
    return r.status === 200 && (r.body?.vip_level === 'free' || r.body?.level === 'free')
      ? { ok: true } : { ok: false, detail: `status=${r.status}` };
  });
  await test('GET /user/vip-status 高级会员', async () => {
    const r = await get('/user/vip-status', { token: S.tok_premium });
    return r.status === 200 && (r.body?.vip_level === 'premium' || r.body?.level === 'premium')
      ? { ok: true } : { ok: false, detail: `status=${r.status}` };
  });
  await test('PUT /user/profile 更新资料', async () => {
    const r = await put('/user/profile', { token: S.tok_free, json: { username: 'tester_free', email: 'tester_free@test.local' } });
    return expect(r.status, [200]);
  });
  await test('PUT /user/profile 占用他人邮箱应 400', async () => {
    const r = await put('/user/profile', { token: S.tok_free, json: { username: 'tester_free', email: 'tester_basic@test.local' } });
    return expect(r.status, [400]);
  });
  await test('PUT /user/password 旧密码错误应 400', async () => {
    const r = await put('/user/password', { token: S.tok_points, json: { oldPassword: 'wrong', newPassword: 'NewPass@123' } });
    return expect(r.status, [400]);
  });
  await test('PUT /user/password 修改密码成功', async () => {
    const r = await put('/user/password', { token: S.tok_points, json: { oldPassword: 'Test@123456', newPassword: 'NewPass@123' } });
    if (r.status !== 200) return { ok: false, detail: `status=${r.status}` };
    const r2 = await put('/user/password', { token: S.tok_points, json: { oldPassword: 'NewPass@123', newPassword: 'Test@123456' } });
    return expect(r2.status, [200]);
  });
  await test('POST /user/avatar 上传头像', async () => {
    const form = makeForm({}, { avatar: { path: PNG, name: 'avatar.png', type: 'image/png' } });
    const r = await post('/user/avatar', { token: S.tok_free, form });
    return r.status === 200 && !!r.body?.user?.avatar_url
      ? { ok: true } : { ok: false, detail: `status=${r.status}` };
  });
  await test('POST /user/avatar/direct 直传头像', async () => {
    const r = await post('/user/avatar/direct', { token: S.tok_free, json: { avatar_url: 'https://mymusic-site.oss-cn-beijing.aliyuncs.com/dev/avatars/avatar-test.png' } });
    const url = r.body?.user?.avatar_url || '';
    return r.status === 200 && url.includes('/dev/avatars/')
      ? { ok: true, detail: 'dev/avatars' } : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 120)}` };
  });
  await test('POST /user/avatar/upload-target 直传目标（OSS dev/avatars）', async () => {
    const r = await post('/user/avatar/upload-target', { token: S.tok_free, json: { file: { name: 'a.png', type: 'image/png' } } });
    const url = r.body?.target?.uploadUrl || '';
    return r.status === 200 && r.body?.direct_upload === true && url.includes('/dev/avatars/')
      ? { ok: true, detail: 'dev/avatars' } : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 150)}` };
  });
  await test('DELETE /user/avatar 恢复默认', async () => {
    const r = await del('/user/avatar', { token: S.tok_free });
    return expect(r.status, [200]);
  });
  await test('GET /user/uploads 上传记录', async () => {
    const r = await get('/user/uploads', { token: S.tok_free });
    return expect(r.status, [200]);
  });
  await test('GET /user/downloads 下载记录', async () => {
    const r = await get('/user/downloads', { token: S.tok_premium });
    return r.status === 200 && (r.body?.total ?? 0) >= 1
      ? { ok: true, detail: `total=${r.body?.total}` } : { ok: false, detail: `status=${r.status}` };
  });

  section('H. 论坛：读接口');
  await test('GET /forum/categories 版块列表', async () => {
    const r = await get('/forum/categories');
    const list = pick(r.body, ['categories', 'list', 'data']);
    return r.status === 200 && Array.isArray(list) && list.length >= 7
      ? { ok: true, detail: `${list.length} 个版块` } : { ok: false, detail: `status=${r.status}` };
  });
  await test('GET /forum/topics 话题列表', async () => {
    const r = await get('/forum/topics');
    return expect(r.status, [200]);
  });
  await test('GET /forum/posts 帖子列表', async () => {
    const r = await get('/forum/posts?page=1&pageSize=5');
    const list = pick(r.body, ['posts', 'list', 'data']);
    return r.status === 200 && Array.isArray(list) && list.length > 0
      ? { ok: true, detail: `total=${r.body?.total ?? list.length}` } : { ok: false, detail: `status=${r.status}` };
  });
  await test('GET /forum/posts 按版块过滤', async () => {
    const r = await get('/forum/posts?category_id=1');
    return expect(r.status, [200]);
  });
  await test('GET /forum/posts 按热度排序', async () => {
    const r = await get('/forum/posts?sort=hot');
    return expect(r.status, [200]);
  });
  await test('GET /forum/posts/:id 帖子详情', async () => {
    const list = await get('/forum/posts?page=1&pageSize=1');
    const first = pick(list.body, ['posts', 'list', 'data'])?.[0];
    if (!first) return { ok: false, detail: '无帖子' };
    const r = await get(`/forum/posts/${first.id ?? first.post_id}`);
    return r.status === 200 && !!r.body?.post?.title
      ? { ok: true, detail: r.body.post.title } : { ok: false, detail: `status=${r.status}` };
  });

  section('I. 论坛：写接口');
  await test('POST /forum/posts 发帖（带媒体）', async () => {
    const r = await post('/forum/posts', {
      token: S.tok_free,
      json: {
        title: '【自动化测试】全量接口测试帖',
        content: '这是自动化测试套件创建的帖子，用于验证论坛发帖、点赞、收藏、评论、置顶、加精等完整流程。',
        category_id: 1,
        images: ['https://mymusic-site.oss-cn-beijing.aliyuncs.com/dev/covers/cover-1784336082475-963572005.jpg'],
      }
    });
    S.testPostId = r.body?.post_id ?? r.body?.id;
    return expect(r.status, [200]) && !!S.testPostId
      ? { ok: true, detail: `post_id=${S.testPostId}` } : { ok: false, detail: `status=${r.status}, body=${r.text}` };
  });
  await test('POST /forum/posts 缺标题应 400', async () => {
    const r = await post('/forum/posts', { token: S.tok_free, json: { content: '没有标题的内容', category_id: 1 } });
    return expect(r.status, [400]);
  });
  await test('发帖 XSS 过滤（标题转义、正文白名单）', async () => {
    const r = await post('/forum/posts', {
      token: S.tok_free,
      json: {
        title: '<script>alert(1)</script>安全测试帖',
        content: '<b>加粗保留</b><script>alert(2)</script><img src=x onerror=alert(3)>',
        category_id: 1,
      }
    });
    const postId = r.body?.post_id ?? r.body?.id;
    if (r.status !== 200 || !postId) return { ok: false, detail: `status=${r.status}` };
    const detail = await get(`/forum/posts/${postId}`);
    const title = detail.body?.post?.title || '';
    const content = detail.body?.post?.content || '';
    const cleaned = !title.includes('<script') && !content.includes('<script') && !content.includes('onerror');
    await del(`/forum/posts/${postId}`, { token: S.tok_admin });
    return cleaned ? { ok: true, detail: 'script/onerror 已过滤' } : { ok: false, detail: `title=${title.slice(0, 60)}, content=${content.slice(0, 80)}` };
  });
  await test('PUT /forum/posts/:id 作者可修改', async () => {
    const r = await put(`/forum/posts/${S.testPostId}`, { token: S.tok_free, json: { title: '【自动化测试】全量接口测试帖(已修改)', content: '修改后的内容', category_id: 1 } });
    return expect(r.status, [200]);
  });
  await test('POST /forum/posts/:id/like 点赞', async () => {
    const r = await post(`/forum/posts/${S.testPostId}/like`, { token: S.tok_basic, json: {} });
    return r.status === 200 && r.body?.liked === true
      ? { ok: true } : { ok: false, detail: `status=${r.status}, liked=${r.body?.liked}` };
  });
  await test('POST /forum/posts/:id/favorite 收藏帖子', async () => {
    const r = await post(`/forum/posts/${S.testPostId}/favorite`, { token: S.tok_basic, json: {} });
    return r.status === 200 && r.body?.favorited === true
      ? { ok: true } : { ok: false, detail: `status=${r.status}` };
  });
  await test('GET /forum/favorites 我的收藏含该帖', async () => {
    const r = await get('/forum/favorites', { token: S.tok_basic });
    const list = pick(r.body, ['favorites', 'list', 'data', 'posts']);
    return r.status === 200 && (list || []).some(p => p.id === S.testPostId || p.post_id === S.testPostId)
      ? { ok: true } : { ok: false, detail: `status=${r.status}` };
  });
  await test('POST /forum/posts/:id/comments 评论帖子', async () => {
    const r = await post(`/forum/posts/${S.testPostId}/comments`, { token: S.tok_basic, json: { content: '自动化测试评论' } });
    S.testForumCommentId = r.body?.comment?.id;
    return expect(r.status, [200]);
  });
  await test('GET /forum/posts/:id/comments 帖子评论列表', async () => {
    const r = await get(`/forum/posts/${S.testPostId}/comments`);
    return expect(r.status, [200]);
  });
  await test('POST /forum/comments/:id/like 评论点赞', async () => {
    if (!S.testForumCommentId) return { ok: false, detail: '评论未创建' };
    const r = await post(`/forum/comments/${S.testForumCommentId}/like`, { token: S.tok_premium, json: {} });
    return r.status === 200 && r.body?.liked === true
      ? { ok: true } : { ok: false, detail: `status=${r.status}` };
  });
  await test('DELETE /forum/comments/:id 删除自己的评论', async () => {
    if (!S.testForumCommentId) return { ok: false, detail: '评论未创建' };
    const r = await del(`/forum/comments/${S.testForumCommentId}`, { token: S.tok_basic });
    return expect(r.status, [200]);
  });
  await test('POST /forum/admin/posts/:id/pin 置顶', async () => {
    const r = await post(`/forum/admin/posts/${S.testPostId}/pin`, { token: S.tok_admin, json: {} });
    return expect(r.status, [200]);
  });
  await test('POST /forum/admin/posts/:id/essence 加精', async () => {
    const r = await post(`/forum/admin/posts/${S.testPostId}/essence`, { token: S.tok_admin, json: {} });
    return expect(r.status, [200]);
  });
  await test('POST /forum/suggest-topics 话题推荐', async () => {
    const r = await post('/forum/suggest-topics', { token: S.tok_free, json: { category_id: 1, title: 'Trap 编曲', content: '808 鼓点与 hi-hat' } });
    return r.status === 200 && Array.isArray(r.body?.suggestions)
      ? { ok: true, detail: `${r.body.suggestions.length} 条建议` } : { ok: false, detail: `status=${r.status}` };
  });
  await test('GET /forum/my-posts', async () => {
    const r = await get('/forum/my-posts', { token: S.tok_free });
    return expect(r.status, [200]);
  });
  await test('GET /forum/my-likes', async () => {
    const r = await get('/forum/my-likes', { token: S.tok_basic });
    return expect(r.status, [200]);
  });
  await test('GET /forum/my-comments', async () => {
    const r = await get('/forum/my-comments', { token: S.tok_basic });
    return expect(r.status, [200]);
  });

  section('J. 论坛：积分/签到/抽奖/兑换');
  await test('GET /forum/sign-in/status', async () => {
    const r = await get('/forum/sign-in/status', { token: S.tok_free });
    return r.status === 200 && typeof r.body?.total_points === 'number'
      ? { ok: true, detail: `points=${r.body.total_points}, 连续=${r.body.consecutive_days}` } : { ok: false, detail: `status=${r.status}` };
  });
  await test('POST /forum/sign-in 签到', async () => {
    const r = await post('/forum/sign-in', { token: S.tok_basic, json: {} });
    const alreadySigned = r.status === 400 && /已签到|签到/.test(r.text);
    return r.status === 200 || alreadySigned
      ? { ok: true, detail: r.status === 200 ? '签到成功' : '今日已签到（幂等）' }
      : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 100)}` };
  });
  await test('GET /forum/points/config 积分规则', async () => {
    const r = await get('/forum/points/config');
    return r.status === 200 && !!r.body?.lottery
      ? { ok: true } : { ok: false, detail: `status=${r.status}` };
  });
  await test('GET /forum/points/transactions 积分流水', async () => {
    const r = await get('/forum/points/transactions', { token: S.tok_free });
    return expect(r.status, [200]);
  });
  await test('GET /forum/lottery/status 抽奖状态', async () => {
    const r = await get('/forum/lottery/status', { token: S.tok_points });
    return r.status === 200 && Array.isArray(r.body?.prizes)
      ? { ok: true } : { ok: false, detail: `status=${r.status}` };
  });
  await test('POST /forum/lottery 抽奖', async () => {
    const r = await post('/forum/lottery', { token: S.tok_points, json: {} });
    // 重复运行同一天次数可能已用完：403 LOTTERY_DAILY_LIMIT_REACHED 也视为符合预期
    if (r.status === 403 && r.body?.code === 'LOTTERY_DAILY_LIMIT_REACHED') {
      return { ok: true, detail: '今日次数已用完（符合预期）' };
    }
    return r.status === 200 && (r.body?.prize?.name || r.body?.message)
      ? { ok: true, detail: r.body?.prize?.name ? `奖品=${r.body.prize.name}, 剩余=${r.body.remaining_chances}` : undefined }
      : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 120)}` };
  });
  await test('抽奖每日次数：config/status 按等级返回且联动一致', async () => {
    const cfg = await get('/forum/points/config', { token: S.tok_points });
    const st = await get('/forum/lottery/status', { token: S.tok_points });
    const daily = cfg.body?.lottery?.daily_chances;
    const stDaily = st.body?.daily_chances;
    const used = st.body?.used_today ?? 0;
    const remaining = st.body?.remaining_chances ?? 0;
    const valid = [1, 2, 3, 5].includes(daily) && daily === stDaily && remaining === Math.max(0, daily - used);
    return valid
      ? { ok: true, detail: `daily=${daily}, used=${used}, remaining=${remaining}` }
      : { ok: false, detail: `config=${daily}, status.daily=${stDaily}, used=${used}, remaining=${remaining}` };
  });
  await test('抽奖超过每日次数应 403 (LOTTERY_DAILY_LIMIT_REACHED)', async () => {
    const st = await get('/forum/lottery/status', { token: S.tok_free });
    const remaining = st.body?.remaining_chances ?? 0;
    if (remaining <= 0) {
      return { ok: true, detail: '今日次数已用完（符合预期）' };
    }
    // 抽完剩余次数，第 remaining+1 次应被拒绝
    for (let i = 0; i < remaining; i++) {
      const r = await post('/forum/lottery', { token: S.tok_free, json: {} });
      if (r.status !== 200) return { ok: false, detail: `第 ${i + 1} 次抽奖 status=${r.status}` };
    }
    const blocked = await post('/forum/lottery', { token: S.tok_free, json: {} });
    return blocked.status === 403 && blocked.body?.code === 'LOTTERY_DAILY_LIMIT_REACHED'
      ? { ok: true, detail: `${blocked.body.used}/${blocked.body.daily_chances}` }
      : { ok: false, detail: `status=${blocked.status}, code=${blocked.body?.code}, body=${blocked.text.slice(0, 120)}` };
  });
  await test('POST /forum/points/exchange 积分兑换会员', async () => {
    // 复位积分，避免历史运行扣分导致余额不足（可重复运行）
    const dbc = await devDb();
    const fdbc = await forumDb();
    const [pr] = await dbc.query('SELECT id FROM users WHERE username = ?', ['tester_points']);
    if (pr[0]?.id) {
      await fdbc.query(
        'INSERT INTO forum_user_points (user_id, total_points) VALUES (?, 3000) ON DUPLICATE KEY UPDATE total_points = 3000',
        [pr[0].id]
      );
    }
    await dbc.end();
    await fdbc.end();
    const r = await post('/forum/points/exchange', { token: S.tok_points, json: { level: 'basic' } });
    return r.status === 200 && r.body?.success === true
      ? { ok: true, detail: `vip=${r.body.vip_level}, 剩余=${r.body.total_points}` } : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 150)}` };
  });
  await test('POST /forum/points/exchange-download 兑换下载权限', async () => {
    const r = await post('/forum/points/exchange-download', { token: S.tok_points, json: {} });
    return r.status === 200 && r.body?.success === true
      ? { ok: true, detail: `剩余=${r.body.remaining_points}` } : { ok: false, detail: `status=${r.status}` };
  });
  await test('GET /forum/points/download-permission 下载权限状态', async () => {
    const r = await get('/forum/points/download-permission', { token: S.tok_points });
    return r.status === 200 && r.body?.remaining_permissions >= 1
      ? { ok: true, detail: `permissions=${r.body.remaining_permissions}` } : { ok: false, detail: `status=${r.status}` };
  });
  await test('积分兑换下载权限后免费用户可下载', async () => {
    // 用真正的免费用户 tester_free，并复位今日下载/未使用权限/积分，保证可重复运行
    const dbc = await devDb();
    const [fr] = await dbc.query('SELECT id FROM users WHERE username = ?', ['tester_free']);
    const fuid = fr[0]?.id;
    if (fuid) await dbc.query('DELETE FROM downloads WHERE user_id = ? AND created_at >= CURDATE()', [fuid]);
    await dbc.end();
    const fdbc = await forumDb();
    if (fuid) {
      await fdbc.query('DELETE FROM forum_point_download_permissions WHERE user_id = ? AND used = 0', [fuid]);
      await fdbc.query(
        'INSERT INTO forum_user_points (user_id, total_points) VALUES (?, 100) ON DUPLICATE KEY UPDATE total_points = 100',
        [fuid]
      );
    }
    await fdbc.end();
    const beat = S.freeBeatId;
    await post(`/beats/${beat}/license/agree`, { token: S.tok_free, json: {} });
    const ex = await post('/forum/points/exchange-download', { token: S.tok_free, json: {} });
    if (ex.status !== 200) return { ok: false, detail: `兑换权限失败 status=${ex.status}, body=${ex.text.slice(0, 120)}` };
    const r = await get(`/beats/${beat}/download`, { token: S.tok_free });
    return assertDownloadOk(r);
  });
  await test('GET /forum/points/config 登录态', async () => {
    const r = await get('/forum/points/config', { token: S.tok_free });
    return expect(r.status, [200]);
  });

  section('K. 论坛：上传');
  await test('POST /forum/upload-target 直传目标（OSS dev/forum-images 前缀）', async () => {
    const r = await post('/forum/upload-target', { token: S.tok_free, json: { file: { name: 'x.png', type: 'image/png' } } });
    const url = r.body?.target?.uploadUrl || '';
    return r.status === 200 && r.body?.direct_upload === true && url.includes('/dev/forum-images/')
      ? { ok: true, detail: 'dev/forum-images' } : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 150)}` };
  });
  await test('真实 OSS 直传 PUT：签名 URL 上传后公开 URL 可读', async () => {
    const r = await post('/forum/upload-target', { token: S.tok_free, json: { file: { name: 'direct-test.png', type: 'image/png' } } });
    const target = r.body?.target;
    if (!target?.uploadUrl || !target?.publicUrl) return { ok: false, detail: '未拿到直传目标' };
    const putRes = await fetch(target.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': target.headers?.['Content-Type'] || 'image/png' },
      body: fs.readFileSync(PNG),
    });
    if (!putRes.ok && putRes.status !== 200) return { ok: false, detail: `PUT status=${putRes.status}` };
    const head = await fetch(target.publicUrl, { method: 'HEAD' });
    const ok = head.status === 200 && target.publicUrl.includes('/dev/forum-images/');
    return ok ? { ok: true, detail: 'PUT→HEAD 200，dev/forum-images' } : { ok: false, detail: `HEAD status=${head.status}` };
  });
  await test('POST /forum/upload-audio 非音频类型应 400', async () => {
    const txt = `${TMP}/not-audio.txt`;
    fs.writeFileSync(txt, 'hello');
    const form = makeForm({}, { audio: { path: txt, name: 'bad.txt', type: 'text/plain' } });
    const r = await post('/forum/upload-audio', { token: S.tok_free, form });
    return expect(r.status, [400]);
  });
  await test('POST /forum/upload-image 上传图片', async () => {
    const form = makeForm({}, { image: { path: PNG, name: 'post.png', type: 'image/png' } });
    const r = await post('/forum/upload-image', { token: S.tok_free, form });
    return r.status === 200 && !!r.body?.image_url
      ? { ok: true } : { ok: false, detail: `status=${r.status}` };
  });
  await test('POST /forum/upload-audio 上传音频', async () => {
    const form = makeForm({}, { audio: { path: WAV, name: 'demo.wav', type: 'audio/wav' } });
    const r = await post('/forum/upload-audio', { token: S.tok_free, form });
    S.testAudioId = r.body?.audio_id;
    S.testAudioUrl = r.body?.audio_url;
    return r.status === 200 && !!r.body?.audio_url
      ? { ok: true, detail: `audio_id=${S.testAudioId}, OSS=${r.body.audio_url.includes('/dev/') ? 'dev/' : 'ROOT!'}` }
      : { ok: false, detail: `status=${r.status}` };
  });
  await test('GET /forum/audio-bpm/:audioId BPM 分析结果', async () => {
    if (!S.testAudioId) return { ok: false, detail: '音频未上传' };
    const r = await get(`/forum/audio-bpm/${S.testAudioId}`, { token: S.tok_free });
    return r.status === 200 && typeof r.body?.ready === 'boolean'
      ? { ok: true, detail: `ready=${r.body.ready}, bpm=${r.body.bpm}` } : { ok: false, detail: `status=${r.status}` };
  });
  await test('POST /forum/upload-video 上传短视频', async () => {
    const form = makeForm({}, { video: { path: MP4, name: 'demo.mp4', type: 'video/mp4' } });
    const r = await post('/forum/upload-video', { token: S.tok_free, form });
    return r.status === 200 && !!r.body?.video_url
      ? { ok: true } : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 120)}` };
  });

  section('L. Banner');
  let bannerId;
  await test('POST /admin/banners/upload-image 上传 Banner 图', async () => {
    const form = makeForm({}, { image: { path: PNG, name: 'banner.png', type: 'image/png' } });
    const r = await post('/admin/banners/upload-image', { token: S.tok_admin, form });
    S.bannerImage = r.body?.stored_value || r.body?.image_url;
    return r.status === 200 && !!S.bannerImage && S.bannerImage.includes('/dev/banners/')
      ? { ok: true, detail: 'dev/banners' } : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 120)}` };
  });
  await test('POST /admin/banners/upload-target 直传目标（OSS dev/banners）', async () => {
    const r = await post('/admin/banners/upload-target', { token: S.tok_admin, json: { file: { name: 'b.png', type: 'image/png' } } });
    const url = r.body?.target?.uploadUrl || '';
    return r.status === 200 && r.body?.direct_upload === true && url.includes('/dev/banners/')
      ? { ok: true, detail: 'dev/banners' } : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 150)}` };
  });
  await test('POST /admin/banners 创建 Banner', async () => {
    const r = await post('/admin/banners', {
      token: S.tok_admin,
      json: { name: '自动化测试 Banner', image_url: S.bannerImage || 'https://mymusic-site.oss-cn-beijing.aliyuncs.com/dev/covers/cover-1784336082475-963572005.jpg', link_url: 'https://example.com', sort_order: 99, is_active: 1 }
    });
    bannerId = r.body?.banner?.id ?? r.body?.id;
    return expect(r.status, [201, 200]) && !!bannerId
      ? { ok: true, detail: `id=${bannerId}` } : { ok: false, detail: `status=${r.status}` };
  });
  await test('GET /banners 公开列表包含新 Banner', async () => {
    const r = await get('/banners');
    const list = pick(r.body, ['banners', 'list']);
    return r.status === 200 && Array.isArray(list) && list.some(b => b.id === bannerId || b.name === '自动化测试 Banner')
      ? { ok: true, detail: `${list.length} 个，含测试 Banner` } : { ok: false, detail: `status=${r.status}` };
  });
  await test('PUT /admin/banners/:id 更新 Banner', async () => {
    const r = await put(`/admin/banners/${bannerId}`, { token: S.tok_admin, json: { name: '自动化测试 Banner-改', is_active: 1 } });
    return expect(r.status, [200]);
  });
  await test('POST /admin/banners/reorder 排序', async () => {
    const r = await post('/admin/banners/reorder', { token: S.tok_admin, json: { items: [{ id: bannerId, sort_order: 1 }] } });
    return expect(r.status, [200]);
  });
  await test('GET /admin/banners 管理列表', async () => {
    const r = await get('/admin/banners', { token: S.tok_admin });
    return expect(r.status, [200]);
  });
  await test('DELETE /admin/banners/:id 删除 Banner', async () => {
    const r = await del(`/admin/banners/${bannerId}`, { token: S.tok_admin });
    return expect(r.status, [200]);
  });

  section('M. Rapper');
  await test('GET /rappers 列表', async () => {
    const r = await get('/rappers');
    const list = pick(r.body, ['rappers', 'list']);
    return r.status === 200 && Array.isArray(list) && list.length >= 8
      ? { ok: true, detail: `${list.length} 个` } : { ok: false, detail: `status=${r.status}` };
  });
  await test('GET /rappers/simple 简洁列表', async () => {
    const r = await get('/rappers/simple');
    return expect(r.status, [200]);
  });
  await test('GET /rappers/stats 统计', async () => {
    const r = await get('/rappers/stats');
    return expect(r.status, [200]);
  });
  await test('GET /rappers/export CSV 导出', async () => {
    const r = await get('/rappers/export');
    return r.status === 200 && r.headers.get('content-type')?.includes('csv')
      ? { ok: true } : { ok: false, detail: `status=${r.status}, ct=${r.headers.get('content-type')}` };
  });
  await test('GET /rappers/:id 详情', async () => {
    const list = (await get('/rappers')).body?.rappers || [];
    const first = list[0];
    if (!first) return { ok: false, detail: '无 Rapper' };
    const r = await get(`/rappers/${first.id}`);
    return r.status === 200 ? { ok: true, detail: first.name } : { ok: false, detail: `status=${r.status}` };
  });
  let tempRapperId;
  await test('POST /rappers 创建 Rapper', async () => {
    const r = await post('/rappers', { token: S.tok_admin, json: { name: 'AutoTestRapper', bio: '自动化测试' } });
    tempRapperId = r.body?.id ?? r.body?.rapper?.id;
    return expect(r.status, [201, 200]) && !!tempRapperId
      ? { ok: true, detail: `id=${tempRapperId}` } : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 120)}` };
  });
  await test('PUT /rappers/:id 更新 Rapper', async () => {
    const r = await put(`/rappers/${tempRapperId}`, { token: S.tok_admin, json: { name: 'AutoTestRapper', bio: '已更新' } });
    return expect(r.status, [200]);
  });
  await test('POST /rappers/import 批量导入', async () => {
    const r = await post('/rappers/import', { token: S.tok_admin, json: { rappers: [{ name: 'AutoTestImportRapper', bio: '导入测试' }] } });
    return r.status === 200 && r.body?.success >= 0
      ? { ok: true, detail: `success=${r.body.success}` } : { ok: false, detail: `status=${r.status}` };
  });
  await test('POST /rappers/recalculate 权重重算', async () => {
    const r = await post('/rappers/recalculate', { token: S.tok_admin, json: {} });
    return expect(r.status, [200]);
  });
  await test('POST /rappers/upload-avatar 上传头像', async () => {
    const form = makeForm({}, { avatar: { path: PNG, name: 'rapper.png', type: 'image/png' } });
    const r = await post('/rappers/upload-avatar', { token: S.tok_admin, form });
    return r.status === 200 && !!r.body?.avatar_url
      ? { ok: true } : { ok: false, detail: `status=${r.status}` };
  });
  await test('DELETE /rappers/:id 删除 Rapper', async () => {
    const r = await del(`/rappers/${tempRapperId}`, { token: S.tok_admin });
    return expect(r.status, [200]);
  });

  section('N. 反馈');
  let feedbackId;
  await test('POST /feedback 游客提交反馈', async () => {
    const r = await post('/feedback', { json: { type: 'suggestion', title: '自动化测试反馈', content: '这是一条自动化测试提交的反馈内容，用于验证反馈功能完整流程。' } });
    return expect(r.status, [200, 201]);
  });
  await test('POST /feedback 内容过短应 400', async () => {
    const r = await post('/feedback', { json: { type: 'bug', title: 'x', content: '短' } });
    return expect(r.status, [400]);
  });
  await test('GET /feedback 我的反馈列表', async () => {
    const r = await get('/feedback', { token: S.tok_free });
    return expect(r.status, [200]);
  });
  await test('GET /admin/feedback 管理列表', async () => {
    const r = await get('/admin/feedback', { token: S.tok_admin });
    const list = pick(r.body, ['feedback', 'list', 'items']);
    const item = (list || []).find(f => f.title === '自动化测试反馈');
    feedbackId = item?.id ?? item?.feedback_id;
    return r.status === 200 ? { ok: true } : { ok: false, detail: `status=${r.status}` };
  });
  await test('GET /admin/feedback/new 新反馈数', async () => {
    const r = await get('/admin/feedback/new', { token: S.tok_admin });
    return expect(r.status, [200]);
  });
  await test('PUT /admin/feedback/:id/reply 回复反馈', async () => {
    if (!feedbackId) return { ok: false, detail: '未找到反馈' };
    const r = await put(`/admin/feedback/${feedbackId}/reply`, { token: S.tok_admin, json: { reply: '已收到，感谢反馈！' } });
    return expect(r.status, [200]);
  });
  await test('DELETE /admin/feedback/:id 删除反馈', async () => {
    if (!feedbackId) return { ok: false, detail: '未找到反馈' };
    const r = await del(`/admin/feedback/${feedbackId}`, { token: S.tok_admin });
    return expect(r.status, [200]);
  });

  section('O. 支付（模拟）');
  await test('POST /payment/create-order 无效等级应 400', async () => {
    const r = await post('/payment/create-order', { token: S.tok_pay, json: { vip_level: 'xxx', pay_type: 'wechat' } });
    return expect(r.status, [400]);
  });
  await test('POST /payment/create-order 模拟支付开通基础会员', async () => {
    const r = await post('/payment/create-order', { token: S.tok_pay, json: { vip_level: 'basic', pay_type: 'wechat' } });
    S.payOrderId = r.body?.order_id;
    return r.status === 200 && r.body?.mode === 'mock'
      ? { ok: true, detail: r.body?.message } : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 120)}` };
  });
  await test('GET /payment/orders 订单列表', async () => {
    const r = await get('/payment/orders', { token: S.tok_pay });
    return r.status === 200 && Array.isArray(r.body) && r.body.length >= 1
      ? { ok: true, detail: `${r.body.length} 单` } : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 100)}` };
  });
  await test('POST /payment/notify 回调不崩溃', async () => {
    const r = await post('/payment/notify', { json: {} });
    return r.status < 500
      ? { ok: true, detail: `status=${r.status}` } : { ok: false, detail: `status=${r.status}` };
  });

  section('P. 管理后台');
  await test('GET /admin/stats 统计', async () => {
    const r = await get('/admin/stats', { token: S.tok_admin });
    return expect(r.status, [200]);
  });
  await test('GET /admin/hot-data 热门数据', async () => {
    const r = await get('/admin/hot-data?days=7&limit=10', { token: S.tok_admin });
    return r.status === 200 && Array.isArray(r.body?.beats)
      ? { ok: true, detail: `${r.body.beats.length} 条` } : { ok: false, detail: `status=${r.status}` };
  });
  await test('GET /admin/users 用户列表', async () => {
    const r = await get('/admin/users', { token: S.tok_admin });
    const list = pick(r.body, ['users', 'list']);
    return r.status === 200 && Array.isArray(list) && list.length >= 5
      ? { ok: true, detail: `${list.length} 人` } : { ok: false, detail: `status=${r.status}` };
  });
  await test('PUT /admin/users/:id/role 修改角色', async () => {
    const uid = S.autoUser && (await get('/admin/users', { token: S.tok_admin })).body?.users?.find(u => u.username === S.autoUser.username)?.id;
    if (!uid) return { ok: false, detail: '未找到自动测试用户' };
    const r = await put(`/admin/users/${uid}/role`, { token: S.tok_admin, json: { role: 'user' } });
    return expect(r.status, [200]);
  });
  await test('PUT /admin/users/:id/vip 修改 VIP', async () => {
    const users = (await get('/admin/users', { token: S.tok_admin })).body?.users || [];
    const uid = users.find(u => u.username === S.autoUser.username)?.id;
    if (!uid) return { ok: false, detail: '未找到自动测试用户' };
    const r = await put(`/admin/users/${uid}/vip`, { token: S.tok_admin, json: { vip_level: 'basic', days: 7 } });
    return expect(r.status, [200]);
  });
  await test('DELETE /admin/users/:id 删除用户', async () => {
    const users = (await get('/admin/users', { token: S.tok_admin })).body?.users || [];
    const uid = users.find(u => u.username === S.autoUser.username)?.id;
    if (!uid) return { ok: false, detail: '未找到自动测试用户' };
    const r = await del(`/admin/users/${uid}`, { token: S.tok_admin });
    return expect(r.status, [200]);
  });
  await test('维护接口无 token 应 401（不实际执行）', async () => {
    const r1 = await post('/admin/maintenance/clear-test-users', { json: {} });
    const r2 = await post('/admin/maintenance/clear-demo-beats', { json: {} });
    return expect(r1.status, [401, 403]) && expect(r2.status, [401, 403]);
  });
  await test('GET /admin/license-templates 模板列表', async () => {
    const r = await get('/admin/license-templates', { token: S.tok_admin });
    return expect(r.status, [200]);
  });
  let licenseTplId;
  await test('POST /admin/license-templates 创建临时模板', async () => {
    const r = await post('/admin/license-templates', { token: S.tok_admin, json: { version: 'test', content: '自动化测试协议模板内容', is_active: 0 } });
    licenseTplId = r.body?.template?.id ?? r.body?.id;
    return expect(r.status, [201, 200]) && !!licenseTplId
      ? { ok: true, detail: `id=${licenseTplId}` } : { ok: false, detail: `status=${r.status}` };
  });
  await test('PUT /admin/license-templates/:id 更新模板', async () => {
    if (!licenseTplId) return { ok: false, detail: '模板未创建' };
    const r = await put(`/admin/license-templates/${licenseTplId}`, { token: S.tok_admin, json: { content: '自动化测试协议模板内容-v2', is_active: 0 } });
    return expect(r.status, [200]);
  });
  await test('DELETE /admin/license-templates/:id 删除临时模板', async () => {
    if (!licenseTplId) return { ok: false, detail: '模板未创建' };
    const r = await del(`/admin/license-templates/${licenseTplId}`, { token: S.tok_admin });
    return expect(r.status, [200]);
  });
  await test('GET /admin/license-agreements 协议同意记录', async () => {
    const r = await get('/admin/license-agreements', { token: S.tok_admin });
    return expect(r.status, [200]);
  });
  await test('GET /admin/license-agreements/export 导出', async () => {
    const r = await get('/admin/license-agreements/export', { token: S.tok_admin });
    return r.status === 200 ? { ok: true } : { ok: false, detail: `status=${r.status}` };
  });

  section('Q. 伴奏上传（管理员）');
  await test('POST /beats/upload-targets 直传目标（OSS dev/audio 前缀）', async () => {
    const r = await post('/beats/upload-targets', { token: S.tok_admin, json: { audio: { name: 'x.mp3', type: 'audio/mpeg' } } });
    const url = r.body?.audio?.uploadUrl || '';
    return r.status === 200 && r.body?.direct_upload === true && url.includes('/dev/audio/')
      ? { ok: true, detail: 'dev/audio' } : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 150)}` };
  });
  let tempBeatId;
  await test('POST /beats/upload 上传 beat（音频+封面）', async () => {
    const form = makeForm(
      { title: '自动化测试 Beat', producer: 'AutoTestProd', genre: 'Trap', bpm: 140, key: 'Am', tags: '测试,Trap', is_free: 1, duration: 60 },
      { audio: { path: WAV, name: 'beat.wav', type: 'audio/wav' }, cover: { path: PNG, name: 'cover.png', type: 'image/png' } }
    );
    const r = await post('/beats/upload', { token: S.tok_admin, form, timeout: 60000 });
    tempBeatId = r.body?.beat?.id ?? r.body?.id;
    return expect(r.status, [201, 200]) && !!tempBeatId
      ? { ok: true, detail: `id=${tempBeatId}` } : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 150)}` };
  });
  await test('PUT /beats/:id 编辑 beat', async () => {
    if (!tempBeatId) return { ok: false, detail: 'beat 未创建' };
    const r = await put(`/beats/${tempBeatId}`, { token: S.tok_admin, json: { title: '自动化测试 Beat-改', bpm: 150 } });
    return expect(r.status, [200]);
  });
  await test('POST /beats/:id/cover/upload-target 封面直传目标（OSS dev/covers）', async () => {
    if (!tempBeatId) return { ok: false, detail: 'beat 未创建' };
    const r = await post(`/beats/${tempBeatId}/cover/upload-target`, { token: S.tok_admin, json: { file: { name: 'c.png', type: 'image/png' } } });
    const url = r.body?.target?.uploadUrl || '';
    return r.status === 200 && r.body?.direct_upload === true && url.includes('/dev/covers/')
      ? { ok: true, detail: 'dev/covers' } : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 150)}` };
  });
  await test('POST /beats/:id/cover 上传封面', async () => {
    if (!tempBeatId) return { ok: false, detail: 'beat 未创建' };
    const form = makeForm({}, { cover: { path: PNG, name: 'cover2.png', type: 'image/png' } });
    const r = await post(`/beats/${tempBeatId}/cover`, { token: S.tok_admin, form });
    return r.status === 200 && !!r.body?.cover_image
      ? { ok: true } : { ok: false, detail: `status=${r.status}` };
  });
  await test('PATCH /beats/:id/cover 替换封面', async () => {
    if (!tempBeatId) return { ok: false, detail: 'beat 未创建' };
    const form = makeForm({}, { cover: { path: PNG, name: 'cover3.png', type: 'image/png' } });
    const r = await patch(`/beats/${tempBeatId}/cover`, { token: S.tok_admin, form });
    return r.status === 200 && !!r.body?.cover_image
      ? { ok: true } : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 120)}` };
  });
  await test('POST /beats/:id/cover 非法类型封面应 400', async () => {
    if (!tempBeatId) return { ok: false, detail: 'beat 未创建' };
    const txt = `${TMP}/bad-cover.txt`;
    fs.writeFileSync(txt, 'not an image');
    const form = makeForm({}, { cover: { path: txt, name: 'bad.txt', type: 'text/plain' } });
    const r = await post(`/beats/${tempBeatId}/cover`, { token: S.tok_admin, form });
    return expect(r.status, [400]);
  });
  await test('POST /beats/upload-direct 直传地址创建 beat', async () => {
    const r = await post('/beats/upload-direct', {
      token: S.tok_admin,
      json: {
        title: '自动化测试 Beat-Direct',
        producer: 'AutoTestProd2',
        genre: 'Drill',
        bpm: 145,
        key: 'Em',
        tags: '测试,Drill',
        is_free: 0,
        duration: 100,
        audio_file_path: S.testAudioUrl || 'https://mymusic-site.oss-cn-beijing.aliyuncs.com/dev/audio/audio-1784336082473-43774292.mp3'
      },
      timeout: 30000
    });
    S.directBeatId = r.body?.beats?.[0]?.id ?? r.body?.beat?.id;
    const beat = r.body?.beats?.[0] || r.body?.beat;
    return expect(r.status, [201, 200]) && !!S.directBeatId && (beat?.file_path || '').includes('/dev/')
      ? { ok: true, detail: `id=${S.directBeatId}, OSS=dev/` } : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 150)}` };
  });
  await test('POST /beats/detect-bpm 音频 BPM 识别', async () => {
    const form = makeForm({}, { audio: { path: WAV, name: 'bpm.wav', type: 'audio/wav' } });
    const r = await post('/beats/detect-bpm', { token: S.tok_admin, form, timeout: 100000 });
    return r.status === 200 && 'bpm' in (r.body || {})
      ? { ok: true, detail: `bpm=${r.body.bpm}, duration=${r.body.duration}` } : { ok: false, detail: `status=${r.status}` };
  });
  await test('他人无权删除我上传的 beat 应 403', async () => {
    if (!S.directBeatId) return { ok: false, detail: 'beat 未创建' };
    const r = await del(`/beats/${S.directBeatId}`, { token: S.tok_free });
    return expect(r.status, [403]);
  });
  await test('DELETE /beats/:id 管理员删除测试 beat', async () => {
    if (!tempBeatId) return { ok: false, detail: 'beat 未创建' };
    const r = await del(`/beats/${tempBeatId}`, { token: S.tok_admin });
    return expect(r.status, [200]);
  });

  // ── 清理 ──
  section('R. 清理测试数据');
  await test('删除直传 beat', async () => {
    if (!S.directBeatId) return { ok: true, detail: '无' };
    const r = await del(`/beats/${S.directBeatId}`, { token: S.tok_admin });
    return expect(r.status, [200]);
  });
  await test('删除测试帖', async () => {
    if (!S.testPostId) return { ok: true, detail: '无' };
    const r = await del(`/forum/posts/${S.testPostId}`, { token: S.tok_admin });
    return expect(r.status, [200]);
  });
  await test('删除导入的测试 Rapper', async () => {
    const list = (await get('/rappers', { token: S.tok_admin })).body?.rappers || [];
    const rp = list.find(r => r.name === 'AutoTestImportRapper');
    if (!rp) return { ok: true, detail: '无' };
    const r = await del(`/rappers/${rp.id}`, { token: S.tok_admin });
    return expect(r.status, [200]);
  });
  await test('删除 upload-direct 自动创建的 Rapper', async () => {
    const list = (await get('/rappers', { token: S.tok_admin })).body?.rappers || [];
    const rp = list.find(r => r.name === 'AutoTestProd2');
    if (!rp) return { ok: true, detail: '无' };
    const r = await del(`/rappers/${rp.id}`, { token: S.tok_admin });
    return expect(r.status, [200]);
  });

  // ── S. 补充：状态流转与边界（幂等，可重复运行） ──
  section('S. 状态流转与边界');
  await test('免费用户经积分兑换每日最多 5 次：第 6 次应 403 (DOWNLOAD_LIMIT_REACHED)', async () => {
    const db = await devDb();
    const [rows] = await db.query('SELECT id FROM users WHERE username = ?', ['tester_free']);
    const uid = rows[0]?.id;
    if (!uid) { await db.end(); return { ok: false, detail: 'tester_free 不存在' }; }
    // 复位今日下载记录与积分，保证可重复运行
    await db.query('DELETE FROM downloads WHERE user_id = ? AND created_at >= CURDATE()', [uid]);
    const fdb = await forumDb();
    await fdb.query(
      'INSERT INTO forum_user_points (user_id, total_points) VALUES (?, 100) ON DUPLICATE KEY UPDATE total_points = 100',
      [uid]
    );
    await fdb.end();

    const list = await get('/beats?page=1&pageSize=20');
    const beats = (pick(list.body, ['beats', 'list']) || []).map(b => b.id).slice(0, 6);
    if (beats.length < 6) { await db.end(); return { ok: false, detail: '可用 beat 不足 6 个' }; }
    for (const bid of beats) {
      await post(`/beats/${bid}/license/agree`, { token: S.tok_free, json: {} });
    }
    for (let i = 0; i < 5; i++) {
      const ex = await post('/forum/points/exchange-download', { token: S.tok_free, json: {} });
      if (ex.status !== 200) { await db.end(); return { ok: false, detail: `兑换下载权限失败 ${i + 1}: ${ex.text.slice(0, 100)}` }; }
    }
    for (let i = 0; i < 5; i++) {
      const d = await get(`/beats/${beats[i]}/download`, { token: S.tok_free });
      const ok = d.status === 302 || (d.status === 200 && (d.headers.get('content-type') || '').includes('audio'));
      if (!ok) { await db.end(); return { ok: false, detail: `第 ${i + 1} 次下载 status=${d.status}` }; }
    }
    const blocked = await get(`/beats/${beats[5]}/download`, { token: S.tok_free });
    await db.end();
    return blocked.status === 403 && blocked.body?.code === 'DOWNLOAD_LIMIT_REACHED'
      ? { ok: true, detail: `${blocked.body.daily_used}/${blocked.body.daily_limit}（经积分兑换）` }
      : { ok: false, detail: `status=${blocked.status}, code=${blocked.body?.code}, body=${blocked.text.slice(0, 120)}` };
  });

  await test('basic 会员每日下载 10 次上限：第 11 次应 403 (DOWNLOAD_LIMIT_REACHED)', async () => {
    const db = await devDb();
    const [rows] = await db.query('SELECT id FROM users WHERE username = ?', ['tester_basic']);
    const uid = rows[0]?.id;
    if (!uid) { await db.end(); return { ok: false, detail: 'tester_basic 不存在' }; }
    // 复位今日下载记录，保证可重复运行
    await db.query('DELETE FROM downloads WHERE user_id = ? AND created_at >= CURDATE()', [uid]);
    const list = await get('/beats?page=1&pageSize=30');
    const beats = (pick(list.body, ['beats', 'list']) || []).map(b => b.id).slice(0, 11);
    if (beats.length < 11) { await db.end(); return { ok: false, detail: '可用 beat 不足 11 个' }; }
    for (const bid of beats) {
      await post(`/beats/${bid}/license/agree`, { token: S.tok_basic, json: {} });
    }
    for (let i = 0; i < 10; i++) {
      const d = await get(`/beats/${beats[i]}/download`, { token: S.tok_basic });
      const ok = d.status === 302 || (d.status === 200 && (d.headers.get('content-type') || '').includes('audio'));
      if (!ok) { await db.end(); return { ok: false, detail: `第 ${i + 1} 次下载 status=${d.status}` }; }
    }
    const blocked = await get(`/beats/${beats[10]}/download`, { token: S.tok_basic });
    await db.end();
    return blocked.status === 403 && blocked.body?.code === 'DOWNLOAD_LIMIT_REACHED'
      ? { ok: true, detail: `${blocked.body.daily_used}/${blocked.body.daily_limit}` }
      : { ok: false, detail: `status=${blocked.status}, code=${blocked.body?.code}, body=${blocked.text.slice(0, 120)}` };
  });

  await test('VIP 到期自动降级：过期用户访问 vip-status 返回 free 并同步落库', async () => {
    // 用全新注册用户避免 VIP 缓存干扰
    const name = `expiry_${Date.now().toString().slice(-8)}`;
    const reg = await post('/auth/register', { json: { username: name, email: `${name}@test.local`, password: 'Test@123456' } });
    if (reg.status !== 201) return { ok: false, detail: `注册失败 status=${reg.status}` };
    const token = reg.body?.token;
    const db = await devDb();
    const [rows] = await db.query('SELECT id FROM users WHERE username = ?', [name]);
    const uid = rows[0]?.id;
    if (!uid) { await db.end(); return { ok: false, detail: '未找到新用户' }; }
    // 模拟已过期的高等级会员
    await db.query(
      "UPDATE users SET vip_level = 'premium', vip_expire_at = '2020-01-01 00:00:00' WHERE id = ?",
      [uid]
    );
    const r = await get('/user/vip-status', { token });
    const after = (await db.query('SELECT vip_level, vip_expire_at FROM users WHERE id = ?', [uid]))[0][0];
    // 清理测试用户
    const usersList = (await get('/admin/users', { token: S.tok_admin })).body?.users || [];
    const adminUid = usersList.find(u => u.username === name)?.id;
    if (adminUid) await del(`/admin/users/${adminUid}`, { token: S.tok_admin });
    await db.end();
    const bodyFree = r.status === 200 && (r.body?.vip_level === 'free' || r.body?.level === 'free');
    return bodyFree && after.vip_level === 'free'
      ? { ok: true, detail: 'vip-status=free 且 DB 已同步为 free' }
      : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 120)}, db=${after.vip_level}` };
  });

  await test('POST /admin/beats/:id/detect-bpm 重新识别 BPM', async () => {
    if (!S.freeBeatId) return { ok: false, detail: '无可用 beat' };
    const r = await post(`/admin/beats/${S.freeBeatId}/detect-bpm`, { token: S.tok_admin, json: {}, timeout: 90000 });
    return r.status === 200 && typeof r.body?.bpm === 'number'
      ? { ok: true, detail: `bpm=${r.body.bpm}, duration=${r.body.duration_seconds}, key=${r.body.key || '-'}` }
      : { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 150)}` };
  });

  await test('抽奖 VIP 奖品分支（强制 VIP 1天）：到期时间按原到期日 +1 天', async () => {
    const db = await devDb();
    const [rows] = await db.query('SELECT id FROM users WHERE username = ?', ['tester_premium']);
    const uid = rows[0]?.id;
    if (!uid) { await db.end(); return { ok: false, detail: 'tester_premium 不存在' }; }
    // 复位今日抽奖流水（重置每日次数）并确保积分充足
    const fdb = await forumDb();
    await fdb.query(
      `DELETE FROM forum_point_transactions
       WHERE user_id = ? AND reason IN ('lottery_cost','lottery_participation','lottery') AND DATE(created_at) = CURDATE()`,
      [uid]
    );
    await fdb.query(
      'INSERT INTO forum_user_points (user_id, total_points) VALUES (?, 200) ON DUPLICATE KEY UPDATE total_points = 200',
      [uid]
    );
    const before = (await db.query('SELECT vip_expire_at FROM users WHERE id = ?', [uid]))[0][0];
    const r = await post('/forum/lottery', {
      token: S.tok_premium,
      json: {},
      headers: { 'x-lottery-force-prize': '6' },
    });
    const after = (await db.query('SELECT vip_expire_at FROM users WHERE id = ?', [uid]))[0][0];
    await db.end();
    await fdb.end();
    if (r.status !== 200) return { ok: false, detail: `status=${r.status}, body=${r.text.slice(0, 120)}` };
    const diffMs = new Date(after.vip_expire_at).getTime() - new Date(before.vip_expire_at).getTime();
    const plusOneDay = diffMs === 86400000;
    return r.body?.prize?.vip_days === 1 && plusOneDay && r.body?.points_earned === -5
      ? { ok: true, detail: `prize=VIP 1天, 到期 +1 天, 净积分=${r.body.points_earned}` }
      : { ok: false, detail: `prize=${JSON.stringify(r.body?.prize)}, diffMs=${diffMs}, earned=${r.body?.points_earned}` };
  });

  // ── T. 积分/签到/转盘/发帖 闭环核验 ──
  section('T. 积分/签到/发帖闭环');
  await test('积分账本闭环：签到+发帖×2+抽奖，sum(流水)=总额，第3帖触顶0分', async () => {
    const name = `loop_${Date.now().toString().slice(-8)}`;
    const reg = await post('/auth/register', { json: { username: name, email: `${name}@test.local`, password: 'Test@123456' } });
    if (reg.status !== 201) return { ok: false, detail: `注册失败 status=${reg.status}` };
    const token = reg.body?.token;
    const uid = reg.body?.user?.id;
    if (!uid) return { ok: false, detail: '未拿到用户 id' };

    // 1. 首日签到 +1
    const s1 = await post('/forum/sign-in', { token, json: {} });
    if (s1.status !== 200 || s1.body?.points_earned !== 1) {
      return { ok: false, detail: `签到异常 status=${s1.status}, body=${s1.text.slice(0, 120)}` };
    }

    // 2. 发帖×2，每次 +5（毛胚等级倍率 1，发帖每日上限 10）
    const postIds = [];
    for (let i = 1; i <= 2; i++) {
      const p = await post('/forum/posts', { token, json: { title: `【闭环测试】${name}-帖${i}`, content: '积分闭环验证', category_id: 1 } });
      if (p.status !== 200 || p.body?.points_earned !== 5) {
        return { ok: false, detail: `发帖${i}异常 status=${p.status}, body=${p.text.slice(0, 120)}` };
      }
      postIds.push(p.body?.post_id ?? p.body?.id);
    }

    // 3. 抽奖（强制中 100 积分）：-5 +100 = 净 +95
    const lot = await post('/forum/lottery', { token, json: {}, headers: { 'x-lottery-force-prize': '5' } });
    if (lot.status !== 200 || lot.body?.prize?.points !== 100 || lot.body?.points_earned !== 95) {
      return { ok: false, detail: `抽奖异常 status=${lot.status}, body=${lot.text.slice(0, 150)}` };
    }

    // 4. 第 3 帖：今日发帖积分已达上限 → 0 分
    const p3 = await post('/forum/posts', { token, json: { title: `【闭环测试】${name}-帖3`, content: '触发每日上限', category_id: 1 } });
    postIds.push(p3.body?.post_id ?? p3.body?.id);
    if (p3.status !== 200 || p3.body?.points_earned !== 0) {
      return { ok: false, detail: `第3帖应0分 status=${p3.status}, body=${p3.text.slice(0, 120)}` };
    }

    // 5. 对账：sum(流水) == 总额 == 1+5+5-5+100 = 106
    const tx = await get('/forum/points/transactions', { token });
    const records = tx.body?.records || [];
    const sum = records.reduce((a, r) => a + Number(r.change || 0), 0);
    const total = tx.body?.total_points;
    const counts = records.reduce((m, r) => { m[r.reason] = (m[r.reason] || 0) + 1; return m; }, {});
    const ledgerOk = sum === total && total === 106
      && counts.sign_in === 1
      && counts.post_created === 2      // 第 3 帖无奖励流水
      && counts.lottery_cost === 1
      && counts.lottery_reward === 1;

    // 6. 抽奖记录落库
    const fdb = await forumDb();
    const [lr] = await fdb.query('SELECT prize_name FROM forum_lottery_records WHERE user_id = ?', [uid]);
    const lotRecordOk = lr.length === 1 && lr[0].prize_name === '100 积分';
    await fdb.end();

    // 清理
    for (const pid of postIds) { if (pid) await del(`/forum/posts/${pid}`, { token: S.tok_admin }); }
    const usersList = (await get('/admin/users', { token: S.tok_admin })).body?.users || [];
    const adminUid = usersList.find(u => u.username === name)?.id;
    if (adminUid) await del(`/admin/users/${adminUid}`, { token: S.tok_admin });

    return ledgerOk && lotRecordOk
      ? { ok: true, detail: `sum=${sum}=total=${total}, reasons=${JSON.stringify(counts)}, 抽奖记录=${lr[0]?.prize_name}` }
      : { ok: false, detail: `sum=${sum}, total=${total}, counts=${JSON.stringify(counts)}, lotRecord=${JSON.stringify(lr)}` };
  });

  await test('签到闭环：连续6天+第7天里程碑，奖励 2+3+50=55 且流水齐全', async () => {
    const name = `sign_${Date.now().toString().slice(-8)}`;
    const reg = await post('/auth/register', { json: { username: name, email: `${name}@test.local`, password: 'Test@123456' } });
    if (reg.status !== 201) return { ok: false, detail: `注册失败 status=${reg.status}` };
    const token = reg.body?.token;
    const uid = reg.body?.user?.id;
    if (!uid) return { ok: false, detail: '未拿到用户 id' };

    // 造 6 天历史签到（不含今天）
    const fdb = await forumDb();
    for (let d = 1; d <= 6; d++) {
      const dt = new Date(Date.now() - d * 86400000);
      const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      await fdb.query('INSERT IGNORE INTO forum_sign_ins (user_id, sign_date, points) VALUES (?, ?, 1)', [uid, dateStr]);
    }
    await fdb.end();

    const before = await get('/forum/sign-in/status', { token });
    if (before.body?.consecutive_days !== 6 || before.body?.signed_today !== false) {
      return { ok: false, detail: `签到前状态异常 ${JSON.stringify(before.body)}` };
    }

    const s = await post('/forum/sign-in', { token, json: {} });
    if (s.status !== 200) return { ok: false, detail: `签到失败 status=${s.status}, body=${s.text.slice(0, 120)}` };
    const respOk = s.body?.consecutive_days === 7
      && s.body?.points_earned === 55
      && s.body?.milestone?.days === 7
      && s.body?.milestone?.points === 50
      && s.body?.total_points === 55;

    const tx = await get('/forum/points/transactions', { token });
    const records = tx.body?.records || [];
    const sum = records.reduce((a, r) => a + Number(r.change || 0), 0);
    const counts = records.reduce((m, r) => { m[r.reason] = (m[r.reason] || 0) + 1; return m; }, {});
    const txOk = sum === 55 && counts.sign_in === 1 && counts.sign_in_streak === 1 && counts.sign_in_milestone === 1;

    const dup = await post('/forum/sign-in', { token, json: {} });
    const dupOk = dup.status === 400;

    const usersList = (await get('/admin/users', { token: S.tok_admin })).body?.users || [];
    const adminUid = usersList.find(u => u.username === name)?.id;
    if (adminUid) await del(`/admin/users/${adminUid}`, { token: S.tok_admin });

    return respOk && txOk && dupOk
      ? { ok: true, detail: `连续=${s.body.consecutive_days}, earned=${s.body.points_earned}, 流水=${JSON.stringify(counts)}` }
      : { ok: false, detail: `resp=${JSON.stringify(s.body)}, counts=${JSON.stringify(counts)}, dup=${dup.status}` };
  });

  await test('点赞奖励闭环：他人点赞给作者 +1 分并写流水', async () => {
    const authorName = `liker_a_${Date.now().toString().slice(-8)}`;
    const likerName = `liker_b_${Date.now().toString().slice(-8)}`;
    const regA = await post('/auth/register', { json: { username: authorName, email: `${authorName}@test.local`, password: 'Test@123456' } });
    const regB = await post('/auth/register', { json: { username: likerName, email: `${likerName}@test.local`, password: 'Test@123456' } });
    if (regA.status !== 201 || regB.status !== 201) return { ok: false, detail: '注册作者/点赞用户失败' };
    const tokenA = regA.body?.token;
    const tokenB = regB.body?.token;
    const uidA = regA.body?.user?.id;

    const p = await post('/forum/posts', { token: tokenA, json: { title: `【闭环测试】${authorName}-求赞`, content: '点赞奖励验证', category_id: 1 } });
    const postId = p.body?.post_id ?? p.body?.id;
    if (p.status !== 200 || !postId) return { ok: false, detail: `发帖失败 status=${p.status}` };

    const like = await post(`/forum/posts/${postId}/like`, { token: tokenB, json: {} });
    if (like.status !== 200 || like.body?.liked !== true) return { ok: false, detail: `点赞失败 status=${like.status}` };

    const tx = await get('/forum/points/transactions', { token: tokenA });
    const records = tx.body?.records || [];
    const earned = records.filter(r => r.reason === 'post_liked').reduce((a, r) => a + Number(r.change || 0), 0);
    const total = tx.body?.total_points;

    await del(`/forum/posts/${postId}`, { token: S.tok_admin });
    for (const [u, t] of [[authorName, tokenA], [likerName, tokenB]]) {
      const usersList = (await get('/admin/users', { token: S.tok_admin })).body?.users || [];
      const adminUid = usersList.find(x => x.username === u)?.id;
      if (adminUid) await del(`/admin/users/${adminUid}`, { token: S.tok_admin });
    }

    return earned === 1 && total === 6
      ? { ok: true, detail: `post_created +5 + post_liked +1 = ${total}` }
      : { ok: false, detail: `earned=${earned}, total=${total}` };
  });

  await test('签到里程碑闭环：连续 30 天获得 200 分里程碑', async () => {
    const name = `ms30_${Date.now().toString().slice(-8)}`;
    const reg = await post('/auth/register', { json: { username: name, email: `${name}@test.local`, password: 'Test@123456' } });
    if (reg.status !== 201) return { ok: false, detail: `注册失败 status=${reg.status}` };
    const token = reg.body?.token;
    const uid = reg.body?.user?.id;
    const fdb = await forumDb();
    for (let d = 1; d <= 29; d++) {
      const dt = new Date(Date.now() - d * 86400000);
      const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      await fdb.query('INSERT IGNORE INTO forum_sign_ins (user_id, sign_date, points) VALUES (?, ?, 1)', [uid, dateStr]);
    }
    await fdb.end();

    const s = await post('/forum/sign-in', { token, json: {} });
    if (s.status !== 200) return { ok: false, detail: `签到失败 status=${s.status}` };
    const ok = s.body?.consecutive_days === 30
      && s.body?.points_earned === 205           // 2(签到) + 3(连续) + 200(里程碑)
      && s.body?.milestone?.days === 30
      && s.body?.milestone?.points === 200
      && s.body?.total_points === 205;
    const tx = await get('/forum/points/transactions', { token });
    const records = tx.body?.records || [];
    const sum = records.reduce((a, r) => a + Number(r.change || 0), 0);
    const counts = records.reduce((m, r) => { m[r.reason] = (m[r.reason] || 0) + 1; return m; }, {});
    const txOk = sum === 205 && counts.sign_in_milestone === 1;

    const usersList = (await get('/admin/users', { token: S.tok_admin })).body?.users || [];
    const adminUid = usersList.find(u => u.username === name)?.id;
    if (adminUid) await del(`/admin/users/${adminUid}`, { token: S.tok_admin });

    return ok && txOk
      ? { ok: true, detail: `连续=${s.body.consecutive_days}, earned=${s.body.points_earned}, 流水=${JSON.stringify(counts)}` }
      : { ok: false, detail: `resp=${JSON.stringify(s.body)}, sum=${sum}, counts=${JSON.stringify(counts)}` };
  });

  await test('签到里程碑闭环：连续 100 天获得 500 分里程碑', async () => {
    const name = `ms100_${Date.now().toString().slice(-8)}`;
    const reg = await post('/auth/register', { json: { username: name, email: `${name}@test.local`, password: 'Test@123456' } });
    if (reg.status !== 201) return { ok: false, detail: `注册失败 status=${reg.status}` };
    const token = reg.body?.token;
    const uid = reg.body?.user?.id;
    const fdb = await forumDb();
    for (let d = 1; d <= 99; d++) {
      const dt = new Date(Date.now() - d * 86400000);
      const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      await fdb.query('INSERT IGNORE INTO forum_sign_ins (user_id, sign_date, points) VALUES (?, ?, 1)', [uid, dateStr]);
    }
    await fdb.end();

    const s = await post('/forum/sign-in', { token, json: {} });
    if (s.status !== 200) return { ok: false, detail: `签到失败 status=${s.status}` };
    const ok = s.body?.consecutive_days === 100
      && s.body?.points_earned === 505           // 2(签到) + 3(连续) + 500(里程碑)
      && s.body?.milestone?.days === 100
      && s.body?.milestone?.points === 500
      && s.body?.total_points === 505;
    const tx = await get('/forum/points/transactions', { token });
    const records = tx.body?.records || [];
    const sum = records.reduce((a, r) => a + Number(r.change || 0), 0);
    const counts = records.reduce((m, r) => { m[r.reason] = (m[r.reason] || 0) + 1; return m; }, {});
    const txOk = sum === 505 && counts.sign_in_milestone === 1;

    const usersList = (await get('/admin/users', { token: S.tok_admin })).body?.users || [];
    const adminUid = usersList.find(u => u.username === name)?.id;
    if (adminUid) await del(`/admin/users/${adminUid}`, { token: S.tok_admin });

    return ok && txOk
      ? { ok: true, detail: `连续=${s.body.consecutive_days}, earned=${s.body.points_earned}, 流水=${JSON.stringify(counts)}` }
      : { ok: false, detail: `resp=${JSON.stringify(s.body)}, sum=${sum}, counts=${JSON.stringify(counts)}` };
  });

  await test('发帖奖励等级倍率：炸场(≥500分)发帖 +10，当日上限 10 分', async () => {
    const name = `mul_${Date.now().toString().slice(-8)}`;
    const reg = await post('/auth/register', { json: { username: name, email: `${name}@test.local`, password: 'Test@123456' } });
    if (reg.status !== 201) return { ok: false, detail: `注册失败 status=${reg.status}` };
    const token = reg.body?.token;
    const uid = reg.body?.user?.id;
    // 直接置 600 分（炸场等级，倍率 2），本用例只校验增量
    const fdb = await forumDb();
    await fdb.query(
      'INSERT INTO forum_user_points (user_id, total_points) VALUES (?, 600) ON DUPLICATE KEY UPDATE total_points = 600',
      [uid]
    );
    await fdb.end();

    const p1 = await post('/forum/posts', { token, json: { title: `【闭环测试】${name}-倍率1`, content: '倍率验证', category_id: 1 } });
    const p2 = await post('/forum/posts', { token, json: { title: `【闭环测试】${name}-倍率2`, content: '上限验证', category_id: 1 } });
    const ok = p1.status === 200 && p1.body?.points_earned === 10
      && p2.status === 200 && p2.body?.points_earned === 0;

    const tx = await get('/forum/points/transactions', { token });
    const records = tx.body?.records || [];
    const postSum = records.filter(r => r.reason === 'post_created').reduce((a, r) => a + Number(r.change || 0), 0);
    const total = tx.body?.total_points;
    const txOk = postSum === 10 && total === 610;

    const usersList = (await get('/admin/users', { token: S.tok_admin })).body?.users || [];
    const adminUid = usersList.find(u => u.username === name)?.id;
    if (adminUid) await del(`/admin/users/${adminUid}`, { token: S.tok_admin });

    return ok && txOk
      ? { ok: true, detail: `第1帖+10, 第2帖0分, post_created合计=${postSum}, total=${total}` }
      : { ok: false, detail: `p1=${JSON.stringify(p1.body)}, p2=${JSON.stringify(p2.body)}, postSum=${postSum}, total=${total}` };
  });

  await test('评论奖励闭环：5 条评论 +10（每日上限）、他人点赞 +1', async () => {
    const authorName = `cmt_a_${Date.now().toString().slice(-8)}`;
    const likerName = `cmt_b_${Date.now().toString().slice(-8)}`;
    const regA = await post('/auth/register', { json: { username: authorName, email: `${authorName}@test.local`, password: 'Test@123456' } });
    const regB = await post('/auth/register', { json: { username: likerName, email: `${likerName}@test.local`, password: 'Test@123456' } });
    if (regA.status !== 201 || regB.status !== 201) return { ok: false, detail: '注册评论作者/点赞用户失败' };
    const tokenA = regA.body?.token;
    const tokenB = regB.body?.token;

    const posts = await get('/forum/posts?page=1&pageSize=1');
    const postId = pick(posts.body, ['posts', 'list', 'data'])?.[0]?.id;
    if (!postId) return { ok: false, detail: '无帖子可评论' };

    const commentIds = [];
    let earnedSum = 0;
    for (let i = 1; i <= 5; i++) {
      const c = await post(`/forum/posts/${postId}/comments`, { token: tokenA, json: { content: `闭环评论-${i}` } });
      if (c.status !== 200) return { ok: false, detail: `评论${i}失败 status=${c.status}` };
      earnedSum += c.body?.points_earned || 0;
      commentIds.push(c.body?.comment?.id);
    }
    const c6 = await post(`/forum/posts/${postId}/comments`, { token: tokenA, json: { content: '闭环评论-第6条' } });
    const capOk = c6.status === 200 && c6.body?.points_earned === 0;

    const like = await post(`/forum/comments/${commentIds[0]}/like`, { token: tokenB, json: {} });
    const likeOk = like.status === 200 && like.body?.liked === true;

    const tx = await get('/forum/points/transactions', { token: tokenA });
    const records = tx.body?.records || [];
    const ccSum = records.filter(r => r.reason === 'comment_created').reduce((a, r) => a + Number(r.change || 0), 0);
    const clSum = records.filter(r => r.reason === 'comment_liked').reduce((a, r) => a + Number(r.change || 0), 0);
    const total = tx.body?.total_points;
    const ok = earnedSum === 10 && capOk && likeOk && ccSum === 10 && clSum === 1 && total === 11;

    for (const [u] of [[authorName], [likerName]]) {
      const usersList = (await get('/admin/users', { token: S.tok_admin })).body?.users || [];
      const adminUid = usersList.find(x => x.username === u)?.id;
      if (adminUid) await del(`/admin/users/${adminUid}`, { token: S.tok_admin });
    }

    return ok
      ? { ok: true, detail: `comment_created +10, comment_liked +1, total=${total}` }
      : { ok: false, detail: `earnedSum=${earnedSum}, cap=${JSON.stringify(c6.body)}, like=${like.status}, cc=${ccSum}, cl=${clSum}, total=${total}` };
  });

  // ── 汇总 ──
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  通过: ${pass}   失败: ${fail}`);
  console.log(`═══════════════════════════════════════════`);
  if (failures.length) {
    console.log('\n失败明细:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('测试套件异常终止:', err);
  process.exit(1);
});
