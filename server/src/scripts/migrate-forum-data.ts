/**
 * 论坛数据迁移脚本
 * 将 rap_beats 库中的论坛表数据迁移到 rap_beats_forum 库
 * 
 * 运行方式: npx tsx src/scripts/migrate-forum-data.ts
 */

import mysql from 'mysql2/promise';

const MAIN_DB = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'rapbeats',
  password: process.env.DB_PASSWORD || 'Wangzhe.q5',
  database: process.env.DB_NAME || 'rap_beats',
};

const FORUM_DB = {
  host: process.env.FORUM_DB_HOST || MAIN_DB.host,
  port: Number(process.env.FORUM_DB_PORT || MAIN_DB.port),
  user: process.env.FORUM_DB_USER || MAIN_DB.user,
  password: process.env.FORUM_DB_PASSWORD || MAIN_DB.password,
  database: process.env.FORUM_DB_NAME || 'rap_beats_forum',
};

interface ForumCategory {
  id: number;
  name: string;
  slug: string;
  icon: string;
  description: string;
  sort_order: number;
  is_active: number;
  post_count: number;
  created_at: Date;
}

interface ForumTopic {
  id: number;
  name: string;
  slug: string;
  category_id: number;
  post_count: number;
  is_active: number;
  created_at: Date;
}

interface ForumPost {
  id: number;
  user_id: number;
  category_id: number;
  title: string;
  content: string;
  beat_id: number | null;
  cover_image: string | null;
  music_file: string | null;
  music_title: string | null;
  music_artist: string | null;
  music_genre: string | null;
  music_bpm: number | null;
  music_cover_image: string | null;
  images: string;
  topic_ids: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  is_pinned: number;
  is_essence: number;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface ForumComment {
  id: number;
  post_id: number;
  user_id: number;
  parent_id: number | null;
  content: string;
  like_count: number;
  created_at: Date;
}

interface ForumLike {
  id: number;
  user_id: number;
  post_id: number;
  created_at: Date;
}

interface ForumFavorite {
  id: number;
  user_id: number;
  post_id: number;
  created_at: Date;
}

interface ForumSignIn {
  id: number;
  user_id: number;
  sign_date: Date;
  points: number;
  created_at: Date;
}

interface ForumUserPoint {
  id: number;
  user_id: number;
  total_points: number;
  updated_at: Date;
}

async function migrate() {
  console.log('🔌 连接数据库...');
  
  const mainConn = await mysql.createConnection(MAIN_DB);
  const forumConn = await mysql.createConnection(FORUM_DB);

  console.log(`📦 主库: ${MAIN_DB.database}`);
  console.log(`📦 论坛库: ${FORUM_DB.database}`);

  // ─── Step 1: 清空论坛库种子数据 ────────────────────────────────────────────
  console.log('\n🧹 清空论坛库旧数据...');
  await forumConn.query('SET FOREIGN_KEY_CHECKS = 0');
  await forumConn.query('TRUNCATE TABLE forum_user_points');
  await forumConn.query('TRUNCATE TABLE forum_sign_ins');
  await forumConn.query('TRUNCATE TABLE forum_favorites');
  await forumConn.query('TRUNCATE TABLE forum_likes');
  await forumConn.query('TRUNCATE TABLE forum_comments');
  await forumConn.query('TRUNCATE TABLE forum_posts');
  await forumConn.query('TRUNCATE TABLE forum_topics');
  await forumConn.query('TRUNCATE TABLE forum_categories');
  await forumConn.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('✅ 论坛库已清空');

  // ─── Step 2: 迁移 forum_categories ─────────────────────────────────────────
  console.log('\n📂 迁移 forum_categories...');
  const [categories] = await mainConn.query<mysql.RowDataPacket[]>(
    'SELECT * FROM forum_categories'
  ) as [ForumCategory[], any];
  console.log(`   待迁移: ${categories.length} 条`);

  // 建立旧ID -> 新ID 映射
  const categoryIdMap: Record<number, number> = {};
  for (const cat of categories) {
    const [result] = await forumConn.query<mysql.ResultSetHeader>(
      `INSERT INTO forum_categories 
        (id, name, slug, icon, description, sort_order, is_active, post_count, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cat.id, cat.name, cat.slug, cat.icon, cat.description, cat.sort_order, cat.is_active, cat.post_count, cat.created_at]
    );
    categoryIdMap[cat.id] = cat.id; // 显式指定ID，保持一致
    console.log(`   ✅ [${cat.id}] ${cat.name} (slug: ${cat.slug})`);
  }
  console.log(`✅ 迁移 ${categories.length} 条分类，ID映射已建立`);

  // ─── Step 3: 迁移 forum_topics ─────────────────────────────────────────────
  console.log('\n📂 迁移 forum_topics...');
  const [topics] = await mainConn.query<mysql.RowDataPacket[]>(
    'SELECT * FROM forum_topics'
  ) as [ForumTopic[], any];
  console.log(`   待迁移: ${topics.length} 条`);

  const topicIdMap: Record<number, number> = {};
  for (const topic of topics) {
    const newCategoryId = categoryIdMap[topic.category_id] ?? topic.category_id;
    const [result] = await forumConn.query<mysql.ResultSetHeader>(
      `INSERT INTO forum_topics 
        (id, name, slug, category_id, post_count, is_active, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [topic.id, topic.name, topic.slug, newCategoryId, topic.post_count, topic.is_active, topic.created_at]
    );
    topicIdMap[topic.id] = topic.id;
    console.log(`   ✅ [${topic.id}] ${topic.name} → category ${newCategoryId}`);
  }
  console.log(`✅ 迁移 ${topics.length} 条话题`);

  // ─── Step 4: 迁移 forum_posts ─────────────────────────────────────────────
  console.log('\n📂 迁移 forum_posts...');
  const [posts] = await mainConn.query<mysql.RowDataPacket[]>(
    'SELECT * FROM forum_posts'
  ) as [ForumPost[], any];
  console.log(`   待迁移: ${posts.length} 条`);

  const postIdMap: Record<number, number> = {};
  for (const post of posts) {
    const newCategoryId = categoryIdMap[post.category_id] ?? post.category_id;
    const newPostId = post.id; // 保持ID一致
    
    await forumConn.query(
      `INSERT INTO forum_posts 
        (id, user_id, category_id, title, content, beat_id, cover_image, 
         music_file, music_title, music_artist, music_genre, music_bpm, music_cover_image,
         images, topic_ids, view_count, like_count, comment_count, is_pinned, is_essence, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newPostId, post.user_id, newCategoryId, post.title, post.content, post.beat_id,
        post.cover_image, post.music_file, post.music_title, post.music_artist,
        post.music_genre, post.music_bpm, post.music_cover_image,
        post.images, post.topic_ids, post.view_count, post.like_count,
        post.comment_count, post.is_pinned, post.is_essence, post.status,
        post.created_at, post.updated_at
      ]
    );
    postIdMap[post.id] = newPostId;
    console.log(`   ✅ [${post.id}] "${post.title}"`);
    console.log(`      🎵 music_file: ${post.music_file ?? '无'}`);
    console.log(`      🖼️  images: ${post.images?.length > 50 ? post.images.substring(0, 50) + '...' : post.images}`);
  }
  console.log(`✅ 迁移 ${posts.length} 条帖子`);

  // ─── Step 5: 迁移 forum_comments ───────────────────────────────────────────
  console.log('\n📂 迁移 forum_comments...');
  const [comments] = await mainConn.query<mysql.RowDataPacket[]>(
    'SELECT * FROM forum_comments'
  ) as [ForumComment[], any];
  console.log(`   待迁移: ${comments.length} 条`);

  for (const comment of comments) {
    const newPostId = postIdMap[comment.post_id];
    if (!newPostId) {
      console.log(`   ⚠️  跳过评论 ${comment.id}，帖子 ${comment.post_id} 不存在`);
      continue;
    }
    await forumConn.query(
      `INSERT INTO forum_comments (id, post_id, user_id, parent_id, content, like_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [comment.id, newPostId, comment.user_id, comment.parent_id, comment.content, comment.like_count, comment.created_at]
    );
    console.log(`   ✅ [${comment.id}] post ${comment.post_id} → ${newPostId}`);
  }
  console.log(`✅ 迁移 ${comments.length} 条评论`);

  // ─── Step 6: 迁移 forum_likes ─────────────────────────────────────────────
  console.log('\n📂 迁移 forum_likes...');
  const [likes] = await mainConn.query<mysql.RowDataPacket[]>(
    'SELECT * FROM forum_likes'
  ) as [ForumLike[], any];
  console.log(`   待迁移: ${likes.length} 条`);

  for (const like of likes) {
    const newPostId = postIdMap[like.post_id];
    if (!newPostId) {
      console.log(`   ⚠️  跳过点赞 ${like.id}，帖子 ${like.post_id} 不存在`);
      continue;
    }
    await forumConn.query(
      `INSERT INTO forum_likes (id, user_id, post_id, created_at)
       VALUES (?, ?, ?, ?)`,
      [like.id, like.user_id, newPostId, like.created_at]
    );
    console.log(`   ✅ [${like.id}] post ${like.post_id} → ${newPostId}`);
  }
  console.log(`✅ 迁移 ${likes.length} 条点赞`);

  // ─── Step 7: 迁移 forum_favorites ──────────────────────────────────────────
  console.log('\n📂 迁移 forum_favorites...');
  const [favorites] = await mainConn.query<mysql.RowDataPacket[]>(
    'SELECT * FROM forum_favorites'
  ) as [ForumFavorite[], any];
  console.log(`   待迁移: ${favorites.length} 条`);

  for (const fav of favorites) {
    const newPostId = postIdMap[fav.post_id];
    if (!newPostId) {
      console.log(`   ⚠️  跳过收藏 ${fav.id}，帖子 ${fav.post_id} 不存在`);
      continue;
    }
    await forumConn.query(
      `INSERT INTO forum_favorites (id, user_id, post_id, created_at)
       VALUES (?, ?, ?, ?)`,
      [fav.id, fav.user_id, newPostId, fav.created_at]
    );
    console.log(`   ✅ [${fav.id}] post ${fav.post_id} → ${newPostId}`);
  }
  console.log(`✅ 迁移 ${favorites.length} 条收藏`);

  // ─── Step 8: 迁移 forum_sign_ins ─────────────────────────────────────────
  console.log('\n📂 迁移 forum_sign_ins...');
  const [signIns] = await mainConn.query<mysql.RowDataPacket[]>(
    'SELECT * FROM forum_sign_ins'
  ) as [ForumSignIn[], any];
  console.log(`   待迁移: ${signIns.length} 条`);

  for (const si of signIns) {
    await forumConn.query(
      `INSERT INTO forum_sign_ins (id, user_id, sign_date, points, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [si.id, si.user_id, si.sign_date, si.points, si.created_at]
    );
    console.log(`   ✅ [${si.id}] user ${si.user_id} 签到 ${si.sign_date}`);
  }
  console.log(`✅ 迁移 ${signIns.length} 条签到记录`);

  // ─── Step 9: 迁移 forum_user_points ───────────────────────────────────────
  console.log('\n📂 迁移 forum_user_points...');
  const [points] = await mainConn.query<mysql.RowDataPacket[]>(
    'SELECT * FROM forum_user_points'
  ) as [ForumUserPoint[], any];
  console.log(`   待迁移: ${points.length} 条`);

  for (const pt of points) {
    await forumConn.query(
      `INSERT INTO forum_user_points (id, user_id, total_points, updated_at)
       VALUES (?, ?, ?, ?)`,
      [pt.id, pt.user_id, pt.total_points, pt.updated_at]
    );
    console.log(`   ✅ [${pt.id}] user ${pt.user_id} 积分 ${pt.total_points}`);
  }
  console.log(`✅ 迁移 ${points.length} 条积分记录`);

  // ─── Step 10: forum_point_transactions（新表，无需迁移）──────────────────────
  console.log('\n📂 forum_point_transactions 为新表，无需从主库迁移');

  // ─── 验证 ─────────────────────────────────────────────────────────────────
  console.log('\n🔍 验证迁移结果...');
  const [counts] = await forumConn.query<mysql.RowDataPacket[]>(`
    SELECT 'categories' as tbl, COUNT(*) as cnt FROM forum_categories
    UNION ALL SELECT 'topics', COUNT(*) FROM forum_topics
    UNION ALL SELECT 'posts', COUNT(*) FROM forum_posts
    UNION ALL SELECT 'comments', COUNT(*) FROM forum_comments
    UNION ALL SELECT 'likes', COUNT(*) FROM forum_likes
    UNION ALL SELECT 'favorites', COUNT(*) FROM forum_favorites
    UNION ALL SELECT 'sign_ins', COUNT(*) FROM forum_sign_ins
    UNION ALL SELECT 'user_points', COUNT(*) FROM forum_user_points
  `);
  for (const row of counts as any) {
    console.log(`   ${row.tbl}: ${row.cnt}`);
  }

  await mainConn.end();
  await forumConn.end();
  console.log('\n🎉 论坛数据迁移完成！');
}

migrate().catch((err) => {
  console.error('\n❌ 迁移失败:', err);
  process.exit(1);
});
