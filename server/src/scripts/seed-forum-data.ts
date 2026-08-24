/**
 * dev 论坛模块测试数据种子脚本
 *
 * 用法: npx tsx src/scripts/seed-forum-data.ts
 *
 * 设计目标:
 * - 用 server 现成的 db client(走 server/.env),保持 schema 单一来源
 * - 仅插入业务数据,不 ALTER 任何表(结构由 initDatabase 负责)
 * - 所有 user_id 取自主库 rap_beats_dev.users 真实存在的用户
 * - 已有数据会被清掉再插入(幂等),无破坏性副作用
 *
 * 产物:
 * - 30 个帖子,覆盖 7 个分类
 * - 每帖 1~5 评论,共 ~50 评论(2 篇含二级回复)
 * - ~80 点赞、~25 收藏、~15 关注、3 条签到、5 个积分流水、2 个对话 + 4 条私信
 * - testadmin 的 user_profile/points 已存在则保留
 */

import 'dotenv/config';
import {
  initMySqlDatabaseClientFromEnv,
  getDatabaseClient,
  getForumDatabaseClient,
  getMembershipDatabaseClient,
  initDatabase,
} from '../database/index.js';
import { config } from '../config.js';

interface MainUser { id: number; username: string; role: string; }

const FORUM_USER_COUNT = 25; // 除 testadmin 外,从主库随机挑的活跃用户数
const POSTS_PER_CATEGORY = 4; // 7 个分类 x 4 ≈ 28,加 2 加精帖 ≈ 30
const TOTAL_POSTS = 30;

const POST_TITLES = [
  '求一个类似 GAI 的 Trap beat,80BPM 起',
  '说唱巅峰对决 2026 冠军预测:小精灵 vs 艾热',
  '新人报道:业余写词两年,第一次发歌',
  '刚做完一首 freestyle,大家给点意见',
  '免费的 Boom Bap beat 分享,带工程文件',
  '涂鸦和说唱有什么关系?聊聊街头文化',
  '我在押韵上遇到瓶颈,求教',
  '推荐几个冷门但牛逼的国内说唱厂牌',
  'Beat 制作:808 怎么调才够脏?',
  '深度赏析:幼杀《睡不着》里的双关',
  '新人请教:flow 和 delivery 的区别到底是什么?',
  '用 AI 生成了一段 hook,听听看',
  '说唱巅峰 2026 现场版伴奏哪里能找到?',
  '我做的 beat 总是太干净,怎么加 lo-fi 味道?',
  '为什么押韵越多不一定越好?',
  '求问:hook 必须押韵吗?',
  '纯人声 freestyle 配上 beat 反而变差了',
  'Ink 厂牌最新的合作消息汇总',
  '新人报道第三天,学会了双押',
  '推荐一首适合开车的说唱',
  '我的第一首完整作品,3 分钟,望轻喷',
  'Trap 808 和 Boom Bap 808 的调音区别',
  '说唱巅峰对决 2026 海选现场观众视角',
  '聊聊你们最常用的采样网站',
  '歌词写作:用真实事件作素材会不会侵权?',
  '刚听完 Higher Brothers 新专,失望',
  '【免费】自制的 Chinese Boom Bap beat,15 首打包',
  '新人报到,坐标上海,希望多交流',
  '请教:录音用什么麦克风比较合适(预算 2k)',
  '押韵技巧:单押、双押、三押的取舍',
];

const POST_CONTENT = [
  '老哥们给点建议,预算 300 以内,风格偏 GAI、黄旭那种,有 demo 链接最好🙏',
  '从节目表现看,小精灵的舞台控制力明显领先,但艾热的歌词功底更扎实。你 pick 谁?',
  '写词两年都是自己玩,最近鼓起勇气录了第一首 demo,大家多包涵😅',
  '录了 30 秒 freestyle,flow 自己听着有点僵,求指点',
  '15 首免费 beat,包含 trap / boom bap / lofi 三个风格,百度网盘链接见评论区',
  '涂鸦的视觉冲击和说唱的节奏感其实是一脉相承的——都是街头表达',
  '押韵堆不出来,该读的书读了,该听的歌也听了,卡在瓶颈期',
  '国内厂牌除了活死人、NOUS、Ink 还有哪些值得关注?',
  '808 加压缩和饱和,到底哪个先?',
  '幼杀的歌词信息密度太高,每听一遍都有新发现,听过的可以聊聊',
  '看了很多教程都说要自然,但实际操作起来总觉得自己在 "念"',
  'AI 生成的 hook 听着还行,但总感觉少了点灵魂,你们怎么看?',
  '现场版的伴奏和专辑版差异挺大,想找 clean 版做 remix',
  '加磁带噪音、模拟磁带饱和、减低频——但总感觉差点意思',
  '押韵多但意象空洞,反而不耐听。怎么平衡?',
  '写了一段 hook 但怎么改都不顺,是不是非要押韵?',
  '人声单听还行,配上 beat 整个气势就散了,为什么?',
  'Ink 最近官宣了几个新合作,有兴趣的可以聊聊',
  '第三天学会双押了,虽然还很生硬,但很开心',
  '开车听节奏感强的,有没有推荐?',
  '【作品】《楼下》,3 分钟,讲述一个普通人的日常',
  'Trap 的 808 调得更短更硬,Boom Bap 的 808 调得更长更软',
  '海选现场氛围炸裂,具体聊聊这次舞台设计',
  '抛几个采样网站,大家也可以分享自己常用的',
  '用真实事件作素材,法律边界在哪?',
  '新专听了三遍,失望,流水线产品',
  '百度网盘: 提取码 xxxx,15 首自制 beat 打包',
  '坐标上海,玩说唱两年了,刚发现这个社区',
  '预算 2k 的话,AT2020 还是 SM58?',
  '单押、双押、三押在中文说唱里的应用心得',
];

const COMMENT_CONTENT = [
  '同求!',
  '好帖!',
  '听完了,整体可以,但 hook 那段感觉有点松',
  '踩一脚',
  '楼上说得对',
  '👍',
  '想听 demo',
  '建议你试试这个思路:把副歌的音域拉宽',
  '录音设备很重要,但混音更重要',
  '关注了,后续作品继续发',
  '新人报到',
  '学习了',
  '这个 beat 风格我很喜欢,已收藏',
  '正好我也遇到这个问题',
  '分享一下我的经验:...',
  '反对,我觉得应该反着来',
  '+1',
  '插个眼',
  '求链接',
  '回楼上:链接在第二页',
  '这个工具很好用',
  '建议用 xx 试试',
  '感觉可以',
  '话糙理不糙',
];

const CATEGORIES = [
  { slug: 'creation', name: '创作' },
  { slug: 'rap-battle-2026', name: '说唱巅峰对决2026' },
  { slug: 'graffiti', name: '涂鸦' },
  { slug: 'hit-song', name: '说唱 HIT-SONG' },
  { slug: 'rap', name: '说唱' },
  { slug: 'beats', name: '免费Beat分享' },
  { slug: 'newbie', name: '新人报道' },
];

async function main() {
  console.log('🚀 开始注入论坛测试数据...');
  initMySqlDatabaseClientFromEnv();
  const mainDb = getDatabaseClient();
  const forumDb = getForumDatabaseClient();

  // 1. 确保论坛 schema 存在(从 server 启动时 initDatabase() 复制过来比较重,这里只调一次)
  await initDatabase(mainDb, forumDb, getMembershipDatabaseClient());
  console.log('✅ Schema 就绪');

  // 2. 从主库拿真实用户
  const adminUser = await mainDb.queryOne<MainUser>(
    "SELECT id, username, role FROM users WHERE username = 'testadmin'"
  );
  if (!adminUser) {
    throw new Error('主库找不到 testadmin,无法继续');
  }
  const randomUsers = await mainDb.queryMany<MainUser>(
    `SELECT id, username, role FROM users
     WHERE username != 'testadmin' AND role != 'admin'
     ORDER BY RAND() LIMIT ?`,
    [FORUM_USER_COUNT]
  );
  const users: MainUser[] = [adminUser, ...randomUsers];
  console.log(`✅ 拿到 ${users.length} 个真实用户 (admin: ${adminUser.id})`);

  // 3. 验证所有分类存在
  const cats = await forumDb.queryMany<{ id: number; slug: string; name: string }>(
    'SELECT id, slug, name FROM forum_categories ORDER BY sort_order'
  );
  if (cats.length === 0) {
    throw new Error('forum_categories 为空,启动 server 时会自动同步,先启一次 server 再跑脚本');
  }
  console.log(`✅ 找到 ${cats.length} 个分类: ${cats.map(c => c.slug).join(', ')}`);

  // 4. 清掉旧数据(按顺序,避免外键问题)
  // 积分相关 3 张表现在 membership 库
  const membershipDb = getMembershipDatabaseClient();
  console.log('🧹 清掉旧业务数据(结构保留)...');
  await forumDb.execute('DELETE FROM forum_comment_likes');
  await forumDb.execute('DELETE FROM forum_likes');
  await forumDb.execute('DELETE FROM forum_favorites');
  await forumDb.execute('DELETE FROM forum_messages');
  await forumDb.execute('DELETE FROM forum_conversations');
  await forumDb.execute('DELETE FROM forum_follows');
  await forumDb.execute('DELETE FROM forum_blocks');
  await forumDb.execute('DELETE FROM forum_comments');
  await forumDb.execute('DELETE FROM forum_sign_ins');
  await membershipDb.execute('DELETE FROM point_transactions');
  await forumDb.execute('DELETE FROM forum_lottery_records');
  await membershipDb.execute('DELETE FROM user_points');
  await forumDb.execute('DELETE FROM forum_user_profiles');
  await forumDb.execute('DELETE FROM forum_posts');
  console.log('✅ 清空完成');

  // 5. 插入帖子
  const now = Date.now();
  const insertPost = async (authorId: number, i: number, opts: { isPinned?: boolean; isEssence?: boolean } = {}) => {
    const cat = cats[i % cats.length];
    const title = POST_TITLES[i % POST_TITLES.length];
    const content = POST_CONTENT[i % POST_CONTENT.length];
    const ageHours = i * 2; // 越靠后越新
    const createdAt = new Date(now - ageHours * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
    const r = await forumDb.execute(
      `INSERT INTO forum_posts
       (user_id, category_id, title, content, view_count, like_count, comment_count,
        is_pinned, is_essence, status, topic_ids, images, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        authorId, cat.id, title, content,
        Math.floor(Math.random() * 200) + 20,
        0, 0,
        opts.isPinned ? 1 : 0,
        opts.isEssence ? 1 : 0,
        'published',
        '[]', '[]',
        createdAt, createdAt,
      ]
    );
    return { id: r.insertId!, authorId, categoryId: cat.id, createdAt };
  };

  // ── 分配策略 ────────────────────────────────────────────────────────────────
  // admin (index 0) 发置顶/精华帖 + 40% 的普通帖，其余用户循环填充
  const adminId = adminUser.id;
  const regularUsers = users.slice(1); // 除 admin 外的用户

  const posts: Array<{ id: number; authorId: number; categoryId: number; createdAt: string }> = [];

  // 2 篇置顶帖 + 2 篇精华帖 → 全部由 admin 创建
  for (let i = 0; i < 2; i++) {
    posts.push(await insertPost(adminId, posts.length, { isPinned: true, isEssence: i === 0 }));
  }
  for (let i = 0; i < 2; i++) {
    posts.push(await insertPost(adminId, posts.length, { isEssence: true }));
  }

  // 普通帖：admin 占 40%，其余用户轮询（仅 admin 时全由 admin 发）
  const regularCount = TOTAL_POSTS - posts.length;
  for (let i = 0; i < regularCount; i++) {
    const authorId = (regularUsers.length === 0 || i % 5 < 2)
      ? adminId
      : regularUsers[i % regularUsers.length].id;
    posts.push(await insertPost(authorId, posts.length));
  }
  console.log(`✅ 插入 ${posts.length} 个帖子`);

  // 6. 评论(每帖 1~5 条)
  let totalComments = 0;
  const allCommentIds: number[] = [];
  for (const post of posts) {
    const count = 1 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const c = users[(post.id + i) % users.length];
      const r = await forumDb.execute(
        `INSERT INTO forum_comments (post_id, user_id, content, created_at)
         VALUES (?,?,?,?)`,
        [post.id, c.id, COMMENT_CONTENT[(post.id + i) % COMMENT_CONTENT.length],
         new Date(now - (posts.length - totalComments) * 60_000).toISOString().slice(0, 19).replace('T', ' ')
        ]
      );
      allCommentIds.push(r.insertId!);
      totalComments++;
    }
    await forumDb.execute(
      'UPDATE forum_posts SET comment_count = ? WHERE id = ?',
      [count, post.id]
    );
  }
  // 2 篇帖子加 1 条二级回复(parent_id)
  for (let i = 0; i < 2 && i < allCommentIds.length; i++) {
    const parent = allCommentIds[i];
    const post = posts[i];
    const replyUser = users[(i + 3) % users.length];
    const r = await forumDb.execute(
      `INSERT INTO forum_comments (post_id, user_id, parent_id, content, created_at)
       VALUES (?,?,?,?,?)`,
      [post.id, replyUser.id, parent,
       '回复楼上:同意你的看法',
       new Date(now - 30 * 60_000).toISOString().slice(0, 19).replace('T', ' ')
      ]
    );
    allCommentIds.push(r.insertId!);
    totalComments++;
    await forumDb.execute(
      'UPDATE forum_posts SET comment_count = comment_count + 1 WHERE id = ?',
      [post.id]
    );
  }
  console.log(`✅ 插入 ${totalComments} 条评论(含 2 条二级回复)`);

  // 7. 点赞(每帖 0~8 个用户点赞 + 更新 like_count)
  let totalLikes = 0;
  for (const post of posts) {
    const likeCount = Math.floor(Math.random() * 8);
    const likedUsers = new Set<number>();
    for (let i = 0; i < likeCount; i++) {
      const u = users[(post.id + i * 3 + 1) % users.length];
      if (likedUsers.has(u.id) || u.id === post.authorId) continue;
      likedUsers.add(u.id);
      try {
        await forumDb.execute(
          'INSERT INTO forum_likes (post_id, user_id) VALUES (?,?)',
          [post.id, u.id]
        );
        totalLikes++;
      } catch {}
    }
    if (totalLikes > 0 || likedUsers.size > 0) {
      await forumDb.execute(
        'UPDATE forum_posts SET like_count = ? WHERE id = ?',
        [likedUsers.size, post.id]
      );
    }
  }
  console.log(`✅ 插入 ${totalLikes} 条点赞`);

  // 8. 收藏(15 个,避免重复)
  let totalFavs = 0;
  const seen = new Set<string>();
  for (let i = 0; i < 25; i++) {
    const u = users[(i * 7 + 1) % users.length];
    const p = posts[(i * 5 + 2) % posts.length];
    if (u.id === p.authorId) continue;
    const key = `${u.id}:${p.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await forumDb.execute(
        'INSERT INTO forum_favorites (user_id, post_id) VALUES (?,?)',
        [u.id, p.id]
      );
      totalFavs++;
    } catch {}
  }
  console.log(`✅ 插入 ${totalFavs} 条收藏`);

  // 9. 关注(15 个,避免重复)
  let totalFollows = 0;
  const seenF = new Set<string>();
  for (let i = 0; i < 25; i++) {
    const a = users[(i * 11 + 3) % users.length];
    const b = users[(i * 13 + 7) % users.length];
    if (a.id === b.id) continue;
    const key = `${a.id}:${b.id}`;
    if (seenF.has(key)) continue;
    seenF.add(key);
    try {
      await forumDb.execute(
        'INSERT INTO forum_follows (follower_id, following_id) VALUES (?,?)',
        [a.id, b.id]
      );
      totalFollows++;
    } catch {}
  }
  // 更新 follower_count / following_count
  for (const u of users) {
    const followerCount = await forumDb.queryOne<{ c: number }>(
      'SELECT COUNT(*) AS c FROM forum_follows WHERE following_id = ?', [u.id]
    );
    const followingCount = await forumDb.queryOne<{ c: number }>(
      'SELECT COUNT(*) AS c FROM forum_follows WHERE follower_id = ?', [u.id]
    );
    await forumDb.execute(
      `INSERT INTO forum_user_profiles
       (user_id, bio, location, website, post_count, follower_count, following_count)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE follower_count=VALUES(follower_count), following_count=VALUES(following_count)`,
      [
        u.id,
        `我是 ${u.username},热爱说唱`,
        ['上海', '北京', '广州', '成都', '深圳', '杭州'][u.id % 6],
        '',
        0,
        followerCount?.c ?? 0,
        followingCount?.c ?? 0,
      ]
    );
  }
  console.log(`✅ 插入 ${totalFollows} 条关注 + 更新用户 profile`);

  // 10. 积分 + 签到
  // 给所有用户一些积分(写到 membershipDb)
  for (const u of users) {
    const points = 100 + Math.floor(Math.random() * 500);
    await membershipDb.execute(
      `INSERT INTO user_points (user_id, total_points) VALUES (?,?)
       ON DUPLICATE KEY UPDATE total_points=VALUES(total_points)`,
      [u.id, points]
    );
    await membershipDb.execute(
      `INSERT INTO point_transactions (user_id, \`change\`, reason, created_at)
       VALUES (?,?,?,?)`,
      [u.id, points, 'seed_init',
       new Date(now - 24 * 3600_000).toISOString().slice(0, 19).replace('T', ' ')
      ]
    );
  }
  console.log(`✅ 给 ${users.length} 个用户初始化积分(100~600)`);

  // 给前 8 个用户签到（仅 admin 时只给 admin 签到）
  const signInCount = Math.min(8, users.length);
  for (let i = 0; i < signInCount; i++) {
    const u = users[i];
    const daysAgo = Math.floor(Math.random() * 7);
    await forumDb.execute(
      `INSERT INTO forum_sign_ins (user_id, sign_date, points, created_at)
       VALUES (?,?,?,?)`,
      [
        u.id,
        new Date(now - daysAgo * 24 * 3600_000).toISOString().slice(0, 10),
        10,
        new Date(now - daysAgo * 24 * 3600_000).toISOString().slice(0, 19).replace('T', ' '),
      ]
    );
  }
  console.log(`✅ 插入 1 条签到记录`);

  // 11. 私信会话(2 个对话)
  let convCount = 0;
  let msgCount = 0;
  if (users.length >= 2) {
    const convId1 = `${Math.min(adminUser.id, users[1].id)}_${Math.max(adminUser.id, users[1].id)}`;
    await forumDb.execute(
      `INSERT INTO forum_conversations
       (id, participant_a, participant_b, last_message_content, last_message_at, unread_count_a, unread_count_b)
       VALUES (?,?,?,?,?,?,?)`,
      [convId1, adminUser.id, users[1].id, '收到,谢谢大佬!',
       new Date(now - 3 * 3600_000).toISOString().slice(0, 19).replace('T', ' '),
       0, 1]
    );
    const messages1 = [
      { sender: users[1].id, content: '大佬在吗?问你个事' },
      { sender: adminUser.id, content: '在的,你说' },
      { sender: users[1].id, content: '你之前发的那个 beat 还能分享吗?' },
      { sender: adminUser.id, content: '可以,链接发你' },
      { sender: users[1].id, content: '收到,谢谢大佬!' },
    ];
    for (let i = 0; i < messages1.length; i++) {
      const m = messages1[i];
      await forumDb.execute(
        `INSERT INTO forum_messages (conversation_id, sender_id, receiver_id, content, is_read, created_at)
         VALUES (?,?,?,?,?,?)`,
        [convId1, m.sender,
         m.sender === adminUser.id ? users[1].id : adminUser.id,
         m.content, i < messages1.length - 1 ? 1 : 0,
         new Date(now - (messages1.length - i) * 30 * 60_000).toISOString().slice(0, 19).replace('T', ' ')
        ]
      );
    }
    convCount++;
    msgCount += messages1.length;

    if (users.length >= 4) {
      const convId2 = `${Math.min(users[2].id, users[3].id)}_${Math.max(users[2].id, users[3].id)}`;
      await forumDb.execute(
        `INSERT INTO forum_conversations
         (id, participant_a, participant_b, last_message_content, last_message_at, unread_count_a, unread_count_b)
         VALUES (?,?,?,?,?,?,?)`,
        [convId2, users[2].id, users[3].id, '好的合作',
         new Date(now - 24 * 3600_000).toISOString().slice(0, 19).replace('T', ' '),
         0, 0]
      );
      const messages2 = [
        { sender: users[2].id, content: '有兴趣合作一首吗?' },
        { sender: users[3].id, content: '可以,说说想法' },
        { sender: users[2].id, content: 'Trap 风格,你出 hook' },
        { sender: users[3].id, content: '好的合作' },
      ];
      for (let i = 0; i < messages2.length; i++) {
        const m = messages2[i];
        await forumDb.execute(
          `INSERT INTO forum_messages (conversation_id, sender_id, receiver_id, content, is_read, created_at)
           VALUES (?,?,?,?,?,?)`,
          [convId2, m.sender,
           m.sender === users[2].id ? users[3].id : users[2].id,
           m.content, 1,
           new Date(now - (messages2.length - i + 6) * 30 * 60_000).toISOString().slice(0, 19).replace('T', ' ')
          ]
        );
      }
      convCount++;
      msgCount += messages2.length;
    }
  }
  console.log(`✅ 插入 ${convCount} 个对话,共 ${msgCount} 条私信`);

  console.log('\n🎉 论坛数据种子完成!');
  console.log(`   帖子: ${posts.length}`);
  console.log(`   评论: ${totalComments}`);
  console.log(`   点赞: ${totalLikes}`);
  console.log(`   收藏: ${totalFavs}`);
  console.log(`   关注: ${totalFollows}`);
  console.log(`   签到: ${signInCount}`);
  console.log(`   积分用户: ${users.length}`);
  console.log(`   私信: ${msgCount} 条 (${convCount} 个对话)`);

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ 种子脚本出错:', err);
  process.exit(1);
});