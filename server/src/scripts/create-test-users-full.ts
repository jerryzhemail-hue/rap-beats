/**
 * 20 个综合测试账号 + 论坛数据生成
 * 运行: cd server && node --import tsx/esm src/scripts/create-test-users-full.ts
 *
 * 生成内容:
 * - 20 个不同 VIP 级别的测试账号
 * - 论坛用户资料 (forum_user_profiles)
 * - 论坛积分 (forum_user_points)
 * - 签到记录 (forum_sign_ins)
 * - 帖子 (forum_posts) - 每个用户 0-3 篇
 * - 评论 (forum_comments) - 每个用户 0-5 条
 * - 关注关系 (forum_follows) - 随机关注
 * - 点赞/收藏 (forum_likes, forum_favorites)
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mysql, { RowDataPacket } from 'mysql2/promise';

// ⛔ 保护:此脚本只允许在本地开发环境运行,严禁在生产数据库跑
if (process.env.NODE_ENV === 'production') {
  console.error('❌ create-test-users-full 禁止在 NODE_ENV=production 环境下执行');
  console.error('   当前连到的 DB_NAME:', process.env.DB_NAME);
  console.error('   当前连到的 FORUM_DB_NAME:', process.env.FORUM_DB_NAME);
  console.error('   如确实需要在本地跑,请:NODE_ENV=development npm run create-test-users-full');
  process.exit(1);
}
if (process.env.DB_NAME === 'rap_beats' || process.env.FORUM_DB_NAME === 'rap_beats_forum') {
  console.error('❌ create-test-users-full 检测到线上库名,拒绝执行');
  console.error('   DB_NAME =', process.env.DB_NAME);
  console.error('   FORUM_DB_NAME =', process.env.FORUM_DB_NAME);
  process.exit(1);
}

const USER_PASSWORD = 'Test@123456';

// 20 个测试账号配置（不同 VIP 级别、不同数据量）
const TEST_USERS = [
  // 基础免费用户（5个）
  { username: 'test_free_a', email: 'test_free_a@test.local', vip: 'free', posts: 0, comments: 0, points: 50, signIns: 0 },
  { username: 'test_free_b', email: 'test_free_b@test.local', vip: 'free', posts: 1, comments: 2, points: 100, signIns: 1 },
  { username: 'test_free_c', email: 'test_free_c@test.local', vip: 'free', posts: 2, comments: 5, points: 200, signIns: 3 },
  { username: 'test_free_d', email: 'test_free_d@test.local', vip: 'free', posts: 0, comments: 3, points: 80, signIns: 2 },
  { username: 'test_free_e', email: 'test_free_e@test.local', vip: 'free', posts: 1, comments: 1, points: 30, signIns: 0 },

  // Basic 用户（4个）
  { username: 'test_basic_a', email: 'test_basic_a@test.local', vip: 'basic', posts: 2, comments: 8, points: 500, signIns: 7 },
  { username: 'test_basic_b', email: 'test_basic_b@test.local', vip: 'basic', posts: 3, comments: 10, points: 800, signIns: 10 },
  { username: 'test_basic_c', email: 'test_basic_c@test.local', vip: 'basic', posts: 1, comments: 4, points: 300, signIns: 5 },
  { username: 'test_basic_d', email: 'test_basic_d@test.local', vip: 'basic', posts: 2, comments: 6, points: 600, signIns: 8 },

  // Premium 用户（4个）
  { username: 'test_premium_a', email: 'test_premium_a@test.local', vip: 'premium', posts: 4, comments: 15, points: 2000, signIns: 15 },
  { username: 'test_premium_b', email: 'test_premium_b@test.local', vip: 'premium', posts: 3, comments: 12, points: 1500, signIns: 12 },
  { username: 'test_premium_c', email: 'test_premium_c@test.local', vip: 'premium', posts: 5, comments: 20, points: 3000, signIns: 20 },
  { username: 'test_premium_d', email: 'test_premium_d@test.local', vip: 'premium', posts: 2, comments: 8, points: 1000, signIns: 10 },

  // Ultimate 用户（5个）
  { username: 'test_ultimate_a', email: 'test_ultimate_a@test.local', vip: 'ultimate', posts: 6, comments: 30, points: 5000, signIns: 25 },
  { username: 'test_ultimate_b', email: 'test_ultimate_b@test.local', vip: 'ultimate', posts: 8, comments: 40, points: 8000, signIns: 30 },
  { username: 'test_ultimate_c', email: 'test_ultimate_c@test.local', vip: 'ultimate', posts: 10, comments: 50, points: 10000, signIns: 30 },
  { username: 'test_ultimate_d', email: 'test_ultimate_d@test.local', vip: 'ultimate', posts: 4, comments: 20, points: 4000, signIns: 18 },
  { username: 'test_ultimate_e', email: 'test_ultimate_e@test.local', vip: 'ultimate', posts: 5, comments: 25, points: 6000, signIns: 22 },

  // 特殊用途用户（2个）
  { username: 'test_points', email: 'test_points@test.local', vip: 'free', posts: 2, comments: 10, points: 9999, signIns: 30 },
  { username: 'test_newbie', email: 'test_newbie@test.local', vip: 'free', posts: 0, comments: 0, points: 0, signIns: 0 },
];

// 帖子内容模板
const POST_TITLES = [
  '【分享】Trap 伴奏制作心得',
  '【求助】新手如何练习 freestyle',
  '【讨论】你们喜欢 Trap 还是 Boom Bap？',
  '【推荐】最近在听的几个 rapper',
  '【原创】自己录的 Demo 求点评',
  '【技巧】如何写出好的 verse？',
  '【资源】免费 beats 下载分享',
  '【闲聊】说唱圈最近的八卦',
];

const POST_CONTENTS = [
  '大家好，我是说唱爱好者，最近在学习制作 beats。分享一下我的经验希望能帮到新手。',
  '我是说唱新人，想请教一下各位前辈怎么练习 flow 的变化？',
  '最近在听 Trap 风格的伴奏，感觉 808 的声音特别有感觉。大家有什么推荐吗？',
  '给大家分享几个我最近发现的好 rapper，风格各异但都很优秀。',
  '这是我自己录的一段 verse，录得很粗糙，希望各位大佬不吝赐教。',
];

// 评论模板
const COMMENT_TEMPLATES = [
  '写得不错，赞一个！',
  '学习了，感谢分享',
  '有点东西，但还可以更好',
  '这个 beat 质量很高',
  'flow 很稳，赞',
  '新人报道，多多关照',
  '求 beats 下载链接',
  '太牛了，大佬带带我',
];

// OSS dev 资源（用于帖子媒体）
const DEV_OSS_BASE = 'https://mymusic-site.oss-cn-beijing.aliyuncs.com/dev';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 开始创建 20 个测试账号及论坛数据...\n');

  // 连接主库
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || '3307'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'dev_root_2024',
    database: process.env.DB_NAME || 'rap_beats_dev',
    charset: 'utf8mb4',
  });

  // 连接论坛库
  const forumConn = await mysql.createConnection({
    host: process.env.FORUM_DB_HOST || process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.FORUM_DB_PORT || process.env.DB_PORT || '3307'),
    user: process.env.FORUM_DB_USER || process.env.DB_USER || 'root',
    password: process.env.FORUM_DB_PASSWORD || process.env.DB_PASSWORD || 'dev_root_2024',
    database: process.env.FORUM_DB_NAME || 'rap_beats_forum_dev',
    charset: 'utf8mb4',
  });

  // 确保 admin 管理员存在
  const adminHash = bcrypt.hashSync('Admin@123456', 10);
  await conn.execute(
    `INSERT IGNORE INTO users (username, email, password_hash, role, vip_level)
     VALUES ('testadmin', 'testadmin@test.local', ?, 'admin', 'ultimate')`,
    [adminHash]
  );

  // 获取 admin id
  const [adminRows] = await conn.query<RowDataPacket[] & { id: number }[]>(
    'SELECT id FROM users WHERE username = ?',
    ['testadmin']
  );
  const adminId = adminRows[0]?.id || 1;

  // ========================================
  // 1. 创建/更新测试账号
  // ========================================
  console.log('📝 步骤 1/5: 创建 20 个测试账号...');
  const userIds: Record<string, number> = {};
  const future = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');

  for (const user of TEST_USERS) {
    const hash = bcrypt.hashSync(USER_PASSWORD, 10);
    await conn.execute(
      `INSERT INTO users (username, email, password_hash, role, vip_level, vip_expire_at)
       VALUES (?, ?, ?, 'user', ?, ?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), vip_level = VALUES(vip_level), vip_expire_at = VALUES(vip_expire_at)`,
      [user.username, user.email, hash, user.vip, user.vip === 'free' ? null : future]
    );

    const [rows] = await conn.query<(RowDataPacket & { id: number })[]>(
      'SELECT id FROM users WHERE username = ?',
      [user.username]
    );
    const userId = rows[0]?.id;
    if (!userId) throw new Error(`用户 ${user.username} 插入后未查到 id`);
    userIds[user.username] = userId;
    console.log(`  ✓ ${user.username} (id=${userId}, vip=${user.vip})`);
  }

  // ========================================
  // 2. 创建论坛用户资料
  // ========================================
  console.log('\n📋 步骤 2/5: 创建论坛用户资料...');
  for (const user of TEST_USERS) {
    const uid = userIds[user.username];
    // 先确保 profile 存在
    await forumConn.execute(
      'INSERT IGNORE INTO forum_user_profiles (user_id, bio) VALUES (?, ?)',
      [uid, `这是 ${user.username} 的个人简介`]
    );
  }
  console.log(`  ✓ 已为 ${TEST_USERS.length} 个用户创建论坛资料`);

  // ========================================
  // 3. 初始化论坛积分
  // ========================================
  console.log('\n💰 步骤 3/5: 初始化论坛积分...');
  for (const user of TEST_USERS) {
    const uid = userIds[user.username];
    await forumConn.execute(
      `INSERT INTO forum_user_points (user_id, total_points)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE total_points = VALUES(total_points)`,
      [uid, user.points]
    );
  }
  console.log('  ✓ 积分初始化完成');

  // ========================================
  // 4. 生成签到记录
  // ========================================
  console.log('\n📅 步骤 4/5: 生成签到记录...');
  for (const user of TEST_USERS) {
    const uid = userIds[user.username];
    for (let i = 0; i < user.signIns; i++) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      await forumConn.execute(
        'INSERT IGNORE INTO forum_sign_ins (user_id, sign_date, points) VALUES (?, ?, 1)',
        [uid, dateStr]
      );
    }
  }
  console.log('  ✓ 签到记录生成完成');

  // ========================================
  // 5. 生成帖子
  // ========================================
  console.log('\n📝 步骤 5/5: 生成帖子和评论...');
  const allPostIds: number[] = [];

  for (const user of TEST_USERS) {
    const uid = userIds[user.username];

    for (let p = 0; p < user.posts; p++) {
      const titleIdx = (uid + p) % POST_TITLES.length;
      const contentIdx = (uid + p) % POST_CONTENTS.length;
      const categoryId = ((uid + p) % 7) + 1; // 1-7 分类

      const [result] = await forumConn.execute(
        `INSERT INTO forum_posts (user_id, category_id, title, content, images, status)
         VALUES (?, ?, ?, ?, '[]', 'published')`,
        [uid, categoryId, POST_TITLES[titleIdx] + ` - ${user.username}`, POST_CONTENTS[contentIdx]]
      );

      const insertResult = result as mysql.ResultSetHeader;
      const postId = insertResult.insertId;
      allPostIds.push(postId);

      // 更新用户帖子数
      await forumConn.execute(
        'UPDATE forum_user_profiles SET post_count = post_count + 1 WHERE user_id = ?',
        [uid]
      );
    }
  }
  console.log(`  ✓ 生成 ${allPostIds.length} 篇帖子`);

  // ========================================
  // 6. 生成评论
  // ========================================
  console.log('\n💬 生成评论...');
  let commentCount = 0;

  for (const user of TEST_USERS) {
    const uid = userIds[user.username];

    for (let c = 0; c < user.comments; c++) {
      if (allPostIds.length === 0) break;

      const postId = allPostIds[(uid + c) % allPostIds.length];
      const commentIdx = (uid + c) % COMMENT_TEMPLATES.length;

      try {
        await forumConn.execute(
          'INSERT INTO forum_comments (post_id, user_id, content) VALUES (?, ?, ?)',
          [postId, uid, COMMENT_TEMPLATES[commentIdx]]
        );
        commentCount++;

        // 更新帖子评论数
        await forumConn.execute(
          'UPDATE forum_posts SET comment_count = comment_count + 1 WHERE id = ?',
          [postId]
        );
      } catch (e) {
        // 忽略可能的错误
      }
    }
  }
  console.log(`  ✓ 生成 ${commentCount} 条评论`);

  // ========================================
  // 7. 生成关注关系
  // ========================================
  console.log('\n👥 生成关注关系...');
  const usernames = TEST_USERS.map(u => u.username);

  for (const user of TEST_USERS) {
    const uid = userIds[user.username];

    // 随机关注 3-8 个人
    const followCount = 3 + Math.floor(Math.random() * 6);
    const shuffled = usernames.filter(u => u !== user.username).sort(() => Math.random() - 0.5);

    for (let f = 0; f < Math.min(followCount, shuffled.length); f++) {
      const targetUser = shuffled[f];
      const targetUid = userIds[targetUser];

      try {
        await forumConn.execute(
          'INSERT IGNORE INTO forum_follows (follower_id, following_id) VALUES (?, ?)',
          [uid, targetUid]
        );

        // 更新关注数和粉丝数
        await forumConn.execute(
          'UPDATE forum_user_profiles SET following_count = following_count + 1 WHERE user_id = ?',
          [uid]
        );
        await forumConn.execute(
          'UPDATE forum_user_profiles SET follower_count = follower_count + 1 WHERE user_id = ?',
          [targetUid]
        );
      } catch (e) {
        // 可能已存在，忽略
      }
    }
  }
  console.log('  ✓ 关注关系生成完成');

  // ========================================
  // 8. 生成点赞和收藏
  // ========================================
  console.log('\n❤️ 生成点赞和收藏...');
  for (const user of TEST_USERS) {
    const uid = userIds[user.username];

    // 随机点赞 3-10 篇帖子
    const likeCount = 3 + Math.floor(Math.random() * 8);
    const shuffledPosts = [...allPostIds].sort(() => Math.random() - 0.5);

    for (let l = 0; l < Math.min(likeCount, shuffledPosts.length); l++) {
      try {
        await forumConn.execute(
          'INSERT IGNORE INTO forum_likes (user_id, post_id) VALUES (?, ?)',
          [uid, shuffledPosts[l]]
        );
        await forumConn.execute(
          'UPDATE forum_posts SET like_count = like_count + 1 WHERE id = ?',
          [shuffledPosts[l]]
        );
      } catch (e) {
        // 已存在，忽略
      }
    }

    // 随机收藏 2-5 篇帖子
    const favCount = 2 + Math.floor(Math.random() * 4);
    for (let f = 0; f < Math.min(favCount, shuffledPosts.length); f++) {
      try {
        await forumConn.execute(
          'INSERT IGNORE INTO forum_favorites (user_id, post_id) VALUES (?, ?)',
          [uid, shuffledPosts[f]]
        );
      } catch (e) {
        // 已存在，忽略
      }
    }
  }
  console.log('  ✓ 点赞和收藏生成完成');

  await conn.end();
  await forumConn.end();

  // ========================================
  // 输出汇总
  // ========================================
  console.log('\n========================================');
  console.log('✅ 测试数据创建完成！');
  console.log('========================================\n');

  console.log('📊 账号汇总:');
  console.log('| 用户名 | VIP | 帖子数 | 评论数 | 积分 | 签到 |');
  console.log('|--------|-----|-------|-------|------|------|');
  for (const user of TEST_USERS) {
    console.log(`| ${user.username} | ${user.vip} | ${user.posts} | ${user.comments} | ${user.points} | ${user.signIns} |`);
  }

  console.log('\n🔐 统一密码: Test@123456');
  console.log('👤 管理员: testadmin / Admin@123456');
  console.log('\n📝 注意: 这些数据创建在 rap_beats_dev (3307 端口)');
}

main().catch((err) => {
  console.error('❌ 脚本执行失败:', err);
  process.exit(1);
});
