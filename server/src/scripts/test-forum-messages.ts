/**
 * 论坛私信与用户功能 - 接口测试脚本
 * 运行方式: npx tsx src/scripts/test-forum-messages.ts
 */

import { createInterface } from 'readline';

const BASE_URL = 'http://localhost:3000';
let token = '';
let testUserId = 2; // testadmin

// 简单的 HTTP 请求
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

// 登录获取 token
async function login() {
  console.log('\n📝 登录获取 token...');
  const res = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: 'testadmin', password: 'Admin@123456' }),
  });
  if (res.ok && res.data.token) {
    token = res.data.token;
    testUserId = res.data.user?.id || 2;
    console.log(`✅ 登录成功，User ID: ${testUserId}`);
  } else {
    console.log('❌ 登录失败:', res.data);
  }
  return res.ok;
}

// 测试结果收集
const results: { id: string; name: string; passed: boolean; message: string }[] = [];

function record(id: string, name: string, passed: boolean, message: string = '') {
  results.push({ id, name, passed, message });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${id}] ${name}${message ? ': ' + message : ''}`);
}

// 等待用户输入
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

  // 登录
  if (!await login()) {
    console.log('登录失败，无法继续测试');
    return;
  }

  // ========================================
  // 私信功能测试
  // ========================================
  console.log('\n----------------------------------------');
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
    // 先清理可能存在的旧会话数据
    const convId = '1_2'; // dev1785852636 和 testadmin
    const res = await request('/api/forum/messages', {
      method: 'POST',
      body: JSON.stringify({ receiver_id: 1, content: '测试消息 - ' + Date.now() }),
    });
    record('TC-MSG-002', '发送私信给其他用户', res.ok, `消息ID: ${res.data.message?.id || 'N/A'}`);
  }

  // TC-MSG-003: 获取会话消息列表
  {
    const convId = '1_2';
    const res = await request(`/api/forum/messages/${encodeURIComponent(convId)}`);
    record('TC-MSG-003', '获取会话消息列表', res.ok, `消息数: ${res.data.messages?.length || 0}`);
  }

  // TC-MSG-004: 标记会话已读
  {
    const convId = '1_2';
    const res = await request(`/api/forum/messages/${encodeURIComponent(convId)}/read`, {
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
      body: JSON.stringify({ receiver_id: testUserId, content: '测试消息' }),
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
    const res = await request('/api/forum/users/1');
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
    const res = await request('/api/forum/users/1/posts');
    record('TC-USER-005', '获取用户发布的帖子列表', res.ok, `帖子数: ${res.data.posts?.length || 0}`);
  }

  // ========================================
  // 关注功能测试
  // ========================================
  console.log('\n----------------------------------------');
  console.log('➕ 关注功能测试');
  console.log('----------------------------------------');

  // TC-FOLLOW-001: 关注用户
  {
    // 用户1(testadmin)关注用户5
    const res = await request('/api/forum/users/5/follow', { method: 'POST' });
    record('TC-FOLLOW-001', '关注其他用户', res.ok, `成功: ${res.data.success}`);
  }

  // TC-FOLLOW-002: 取消关注
  {
    const res = await request('/api/forum/users/5/follow', { method: 'DELETE' });
    record('TC-FOLLOW-002', '取消关注', res.ok, `成功: ${res.data.success}`);
  }

  // TC-FOLLOW-003: 检查关注状态
  {
    const res = await request('/api/forum/users/5/follow-status');
    const hasStatus = res.ok && 'is_following' in res.data && 'is_followed_by' in res.data;
    record('TC-FOLLOW-003', '检查关注状态', hasStatus, 
      `is_following: ${res.data.is_following}, is_followed_by: ${res.data.is_followed_by}`);
  }

  // TC-FOLLOW-004: 获取用户粉丝列表
  {
    const res = await request('/api/forum/users/1/followers');
    record('TC-FOLLOW-004', '获取用户粉丝列表', res.ok, `粉丝数: ${res.data.followers?.length || 0}`);
  }

  // TC-FOLLOW-005: 获取用户关注列表
  {
    const res = await request('/api/forum/users/1/followings');
    record('TC-FOLLOW-005', '获取用户关注列表', res.ok, `关注数: ${res.data.followings?.length || 0}`);
  }

  // TC-FOLLOW-006: 关注自己
  {
    const res = await request(`/api/forum/users/${testUserId}/follow`, { method: 'POST' });
    record('TC-FOLLOW-006', '关注自己', res.status === 400, `状态码: ${res.status}`);
  }

  // TC-FOLLOW-007: 重复关注
  {
    // 先关注
    await request('/api/forum/users/5/follow', { method: 'POST' });
    // 再尝试关注
    const res = await request('/api/forum/users/5/follow', { method: 'POST' });
    record('TC-FOLLOW-007', '重复关注', res.status === 409, `状态码: ${res.status}`);
    // 清理
    await request('/api/forum/users/5/follow', { method: 'DELETE' });
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

  // 保存测试报告
  const report = {
    timestamp: new Date().toISOString(),
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
