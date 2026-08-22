/**
 * 论坛私信与用户功能 - 接口测试脚本
 * 运行方式: npx tsx src/scripts/test-forum-messages.ts
 *
 * 修复: 之前硬编码 user_id=1/2/5、convId='1_2' 等,在 dev 环境里都是错的。
 * 现在全部从 API 动态获取:
 *   - admin id ← 登录响应
 *   - peer id ← 主库 /api/forum/users/* 任一非自身用户的真实 id(用 followers 列表找)
 *   - convId ← admin ↔ peer 的真实 conversation_id(从 conversations 接口拿)
 */

import 'dotenv/config';
import { createInterface } from 'readline';

const BASE_URL = 'http://localhost:3000';
let token = '';
let adminId = 0;
let peerId = 0;
let conversationId = '';

async function request(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return { status: res.status, data, ok: res.ok };
}

async function login() {
  console.log('\n📝 登录获取 token...');
  const res = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: 'testadmin', password: 'Admin@123456' }),
  });
  if (!res.ok || !res.data.token) {
    console.log('❌ 登录失败:', res.data);
    return false;
  }
  token = res.data.token;
  adminId = res.data.user?.id;
  console.log(`✅ 登录成功，User ID: ${adminId}`);
  return true;
}

/**
 * 找一个跟 admin 有过互动的真实用户作为 peer。
 * 优先: 自己的 followers/followings;否则从最近帖子作者里找。
 */
async function resolvePeer(): Promise<number> {
  // 方案 A: 关注列表 / 粉丝列表里拿一个
  const followers = await request(`/api/forum/users/${adminId}/followers`);
  if (followers.ok && Array.isArray(followers.data.followers) && followers.data.followers.length > 0) {
    const id = followers.data.followers[0].id ?? followers.data.followers[0].user_id;
    if (id && id !== adminId) {
      console.log(`✅ 从粉丝列表找到 peer: ${id}`);
      return id;
    }
  }
  const followings = await request(`/api/forum/users/${adminId}/followings`);
  if (followings.ok && Array.isArray(followings.data.followings) && followings.data.followings.length > 0) {
    const id = followings.data.followings[0].id ?? followings.data.followings[0].user_id;
    if (id && id !== adminId) {
      console.log(`✅ 从关注列表找到 peer: ${id}`);
      return id;
    }
  }
  // 方案 B: 最新帖子的作者
  const posts = await request('/api/forum/posts?page=1&limit=10');
  if (posts.ok && Array.isArray(posts.data.items)) {
    for (const p of posts.data.items) {
      const uid = p.user_id ?? p.author?.id;
      if (uid && uid !== adminId) {
        console.log(`✅ 从最新帖子作者找到 peer: ${uid} (post: ${p.id})`);
        return uid;
      }
    }
  }
  // 方案 C: 给 admin 自己发一个种子用户 id 当作兜底,理论上不会到这
  throw new Error('找不到任何 peer 用户(dev 论坛为空?),请先跑 seed-forum-data.ts');
}

/**
 * 拿 admin ↔ peer 的真实 conversation_id。
 * 如果不存在,就先发一条消息让服务端创建。
 */
async function resolveConversation(): Promise<string> {
  const convs = await request('/api/forum/messages/conversations');
  if (convs.ok && Array.isArray(convs.data.conversations) && convs.data.conversations.length > 0) {
    for (const c of convs.data.conversations) {
      const a = c.participant_a ?? c.participantA;
      const b = c.participant_b ?? c.participantB;
      if ((a === adminId && b === peerId) || (a === peerId && b === adminId)) {
        console.log(`✅ 找到 conversation: ${c.id}`);
        return c.id;
      }
    }
  }
  // 没就建一个
  console.log('⚠️  无现成 conversation,先发一条触发创建');
  const sent = await request('/api/forum/messages', {
    method: 'POST',
    body: JSON.stringify({ receiver_id: peerId, content: '测试初始化会话 ' + Date.now() }),
  });
  if (sent.ok && (sent.data.conversation_id || sent.data.message?.conversation_id)) {
    const cid = sent.data.conversation_id || sent.data.message.conversation_id;
    console.log(`✅ 新建 conversation: ${cid}`);
    return cid;
  }
  throw new Error('创建 conversation 失败:' + JSON.stringify(sent.data));
}

const results: { id: string; name: string; passed: boolean; message: string }[] = [];

function record(id: string, name: string, passed: boolean, message: string = '') {
  results.push({ id, name, passed, message });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${id}] ${name}${message ? ': ' + message : ''}`);
}

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function runTests() {
  console.log('\n========================================');
  console.log('📋 论坛私信与用户功能 - 接口测试');
  console.log('========================================\n');

  if (!await login()) {
    console.log('登录失败，无法继续测试');
    return;
  }

  // 动态解析 peer 与 conversation
  try {
    peerId = await resolvePeer();
    conversationId = await resolveConversation();
  } catch (e: any) {
    console.log('❌ 解析测试上下文失败:', e.message);
    return;
  }

  console.log(`\n📌 测试上下文: admin=${adminId}, peer=${peerId}, conv=${conversationId}\n`);

  // ========================================
  // 私信功能测试
  // ========================================
  console.log('----------------------------------------');
  console.log('📬 私信功能测试');
  console.log('----------------------------------------');

  // TC-MSG-001: 获取会话列表
  {
    const res = await request('/api/forum/messages/conversations');
    record('TC-MSG-001', '获取会话列表', res.ok, `状态码: ${res.status}`);
  }

  // TC-MSG-005: 获取未读消息总数
  {
    const res = await request('/api/forum/messages/unread-count');
    const unreadCount = Number(res.data.unread_count);
    record('TC-MSG-005', '获取未读消息总数', res.ok && !isNaN(unreadCount), `unread_count: ${unreadCount}`);
  }

  // TC-MSG-002: 发送私信（创建新会话）
  {
    const res = await request('/api/forum/messages', {
      method: 'POST',
      body: JSON.stringify({ receiver_id: peerId, content: '测试消息 - ' + Date.now() }),
    });
    record('TC-MSG-002', '发送私信给其他用户', res.ok, `消息ID: ${res.data.message?.id || 'N/A'}`);
  }

  // TC-MSG-003: 获取会话消息列表
  {
    const res = await request(`/api/forum/messages/${encodeURIComponent(conversationId)}`);
    record('TC-MSG-003', '获取会话消息列表', res.ok, `消息数: ${res.data.messages?.length || 0}`);
  }

  // TC-MSG-004: 标记会话已读
  {
    const res = await request(`/api/forum/messages/${encodeURIComponent(conversationId)}/read`, {
      method: 'PUT',
    });
    record('TC-MSG-004', '标记会话已读', res.ok, `成功: ${res.data.success}`);
  }

  // TC-MSG-006: 给不存在的用户发私信
  {
    const res = await request('/api/forum/messages', {
      method: 'POST',
      body: JSON.stringify({ receiver_id: 99999, content: '测试消息' }),
    });
    record('TC-MSG-006', '给不存在的用户发私信', res.status === 404, `状态码: ${res.status}`);
  }

  // TC-MSG-007: 给自己发私信
  {
    const res = await request('/api/forum/messages', {
      method: 'POST',
      body: JSON.stringify({ receiver_id: adminId, content: '测试消息' }),
    });
    record('TC-MSG-007', '给自己发私信', res.status === 400, `状态码: ${res.status}`);
  }

  // TC-MSG-008: 未登录访问（使用空 token）
  {
    const savedToken = token;
    token = '';
    const res = await request('/api/forum/messages/conversations');
    token = savedToken;
    record('TC-MSG-008', '未登录访问私信接口', res.status === 401, `状态码: ${res.status}`);
  }

  // TC-MSG-009: 访问不存在的会话
  {
    const res = await request('/api/forum/messages/nonexistent_conversation');
    record('TC-MSG-009', '访问不存在的会话', res.status === 404, `状态码: ${res.status}`);
  }

  // ========================================
  // 用户资料功能测试
  // ========================================
  console.log('\n----------------------------------------');
  console.log('👤 用户资料功能测试');
  console.log('----------------------------------------');

  // TC-USER-001: 获取用户资料
  {
    const res = await request(`/api/forum/users/${peerId}`);
    const hasProfile = res.ok && res.data.user?.forum_profile;
    record('TC-USER-001', '获取用户资料', hasProfile,
      `用户: ${res.data.user?.username}, 粉丝: ${res.data.user?.forum_profile?.follower_count}`);
  }

  // TC-USER-002: 更新个人资料
  {
    const res = await request('/api/forum/users/profile', {
      method: 'PUT',
      body: JSON.stringify({ bio: '这是测试简介', location: '测试地点' }),
    });
    record('TC-USER-002', '更新个人资料', res.ok, `bio更新: ${res.data.profile?.bio === '这是测试简介'}`);
  }

  // TC-USER-003: 获取不存在的用户资料
  {
    const res = await request('/api/forum/users/99999');
    record('TC-USER-003', '获取不存在的用户资料', res.status === 404, `状态码: ${res.status}`);
  }

  // TC-USER-004: 更新资料简介超过500字
  {
    const longBio = 'a'.repeat(501);
    const res = await request('/api/forum/users/profile', {
      method: 'PUT',
      body: JSON.stringify({ bio: longBio }),
    });
    record('TC-USER-004', '更新资料简介超过500字', res.status === 400, `状态码: ${res.status}`);
  }

  // TC-USER-005: 获取用户发布的帖子列表
  {
    const res = await request(`/api/forum/users/${peerId}/posts`);
    record('TC-USER-005', '获取用户发布的帖子列表', res.ok, `帖子数: ${res.data.posts?.length || 0}`);
  }

  // ========================================
  // 关注功能测试
  // ========================================
  console.log('\n----------------------------------------');
  console.log('➕ 关注功能测试');
  console.log('----------------------------------------');

  // TC-FOLLOW-001: 关注用户(若已关注则先取消,确保初始干净)
  {
    await request(`/api/forum/users/${peerId}/follow`, { method: 'DELETE' });
    const res = await request(`/api/forum/users/${peerId}/follow`, { method: 'POST' });
    record('TC-FOLLOW-001', '关注其他用户', res.ok && res.data.success === true, `状态码: ${res.status}, success: ${res.data.success}`);
  }

  // TC-FOLLOW-002: 取消关注
  {
    const res = await request(`/api/forum/users/${peerId}/follow`, { method: 'DELETE' });
    record('TC-FOLLOW-002', '取消关注', res.ok, `成功: ${res.data.success}`);
  }

  // TC-FOLLOW-003: 检查关注状态
  {
    const res = await request(`/api/forum/users/${peerId}/follow-status`);
    const hasStatus = res.ok && 'is_following' in res.data && 'is_followed_by' in res.data;
    record('TC-FOLLOW-003', '检查关注状态', hasStatus,
      `is_following: ${res.data.is_following}, is_followed_by: ${res.data.is_followed_by}`);
  }

  // TC-FOLLOW-004: 获取用户粉丝列表
  {
    const res = await request(`/api/forum/users/${adminId}/followers`);
    record('TC-FOLLOW-004', '获取用户粉丝列表', res.ok, `粉丝数: ${res.data.followers?.length || 0}`);
  }

  // TC-FOLLOW-005: 获取用户关注列表
  {
    const res = await request(`/api/forum/users/${adminId}/followings`);
    record('TC-FOLLOW-005', '获取用户关注列表', res.ok, `关注数: ${res.data.followings?.length || 0}`);
  }

  // TC-FOLLOW-006: 关注自己
  {
    const res = await request(`/api/forum/users/${adminId}/follow`, { method: 'POST' });
    record('TC-FOLLOW-006', '关注自己', res.status === 400, `状态码: ${res.status}`);
  }

  // TC-FOLLOW-007: 重复关注
  {
    await request(`/api/forum/users/${peerId}/follow`, { method: 'POST' });
    const res = await request(`/api/forum/users/${peerId}/follow`, { method: 'POST' });
    record('TC-FOLLOW-007', '重复关注', res.status === 409, `状态码: ${res.status}`);
    await request(`/api/forum/users/${peerId}/follow`, { method: 'DELETE' });
  }

  // TC-FOLLOW-008: 取消未关注的用户
  {
    const res = await request('/api/forum/users/99999/follow', { method: 'DELETE' });
    record('TC-FOLLOW-008', '取消未关注的用户', res.status === 404, `状态码: ${res.status}`);
  }

  // ========================================
  // 测试结果汇总
  // ========================================
  console.log('\n========================================');
  console.log('📊 测试结果汇总');
  console.log('========================================\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`总计: ${total} | ✅ 通过: ${passed} | ❌ 失败: ${failed}\n`);

  if (failed > 0) {
    console.log('失败用例:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ [${r.id}] ${r.name}`);
    });
  }

  console.log('\n详细结果:');
  results.forEach(r => {
    console.log(`  ${r.passed ? '✅' : '❌'} [${r.id}] ${r.name}${r.message ? ': ' + r.message : ''}`);
  });

  const report = {
    timestamp: new Date().toISOString(),
    context: { adminId, peerId, conversationId },
    total,
    passed,
    failed,
    results,
  };

  console.log('\n========================================');
  console.log('✅ 测试完成!');
  console.log('========================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);