/**
 * 本地测试数据种子脚本
 * 运行：cd server && node --import tsx/esm scripts/seed-test-data.mjs
 *
 * 功能：
 * 1. 创建测试账号（admin / 各 VIP 等级 / 积分测试号）
 * 2. 为恢复的 39 条 beat 补齐真实元数据（曲风/BPM/调性/标签/免费/VIP/rapper 关联）
 * 3. 播种论坛积分、签到、收藏、下载、播放等关联数据
 * 4. 额外创建 3 条带图片/音频的论坛帖子
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const GENRES = ['Trap', 'Drill', 'Boom Bap', 'Lo-fi', 'R&B', 'Old School', 'Melodic Rap', 'Pop'];
const KEYS = ['Am', 'Em', 'Fm', 'Gm', 'Cm', 'Dm', 'Bbm', 'Abm'];
const RAPPER_NAMES = ['热狗 MC HotDog', 'PG One', 'GAI', 'Bridge', 'TT', 'Jony J', 'VAVA', '艾热'];

// OSS dev/ 前缀资源（与 server/.env 的 OSS_*_PREFIX 隔离配置一致，仅指向 dev/ 副本）
const DEV_OSS_BASE = 'https://mymusic-site.oss-cn-beijing.aliyuncs.com/dev';
const DEV_COVER = `${DEV_OSS_BASE}/covers/cover-1784336082475-963572005.jpg`;
const DEV_AUDIO = `${DEV_OSS_BASE}/audio/audio-1784336082473-43774292.mp3`;
const DEV_BANNER = `${DEV_OSS_BASE}/covers/cover-1784348395186-672321346.jpg`;

const USER_PASSWORD = 'Test@123456';
const ADMIN_PASSWORD = 'Admin@123456';

const USERS = [
  { username: 'testadmin', email: 'testadmin@test.local', password: ADMIN_PASSWORD, role: 'admin', vip: 'ultimate' },
  { username: 'tester_free', email: 'tester_free@test.local', password: USER_PASSWORD, role: 'user', vip: 'free' },
  { username: 'tester_basic', email: 'tester_basic@test.local', password: USER_PASSWORD, role: 'user', vip: 'basic' },
  { username: 'tester_premium', email: 'tester_premium@test.local', password: USER_PASSWORD, role: 'user', vip: 'premium' },
  { username: 'tester_ultimate', email: 'tester_ultimate@test.local', password: USER_PASSWORD, role: 'user', vip: 'ultimate' },
  { username: 'tester_points', email: 'tester_points@test.local', password: USER_PASSWORD, role: 'user', vip: 'free' },
  { username: 'tester_pay', email: 'tester_pay@test.local', password: USER_PASSWORD, role: 'user', vip: 'free' },
];

// 积分初始值（写论坛积分表，本地论坛与主库共用 rap_beats_dev）
const POINTS = {
  tester_free: 100,
  tester_points: 3000,
  tester_basic: 50,
  tester_premium: 50,
  tester_ultimate: 50,
  tester_pay: 20,
};

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'rap_beats_dev',
    charset: 'utf8mb4',
  });
  // 论坛数据在独立论坛库（FORUM_DB_NAME），与主库分离
  const forumConn = await mysql.createConnection({
    host: process.env.FORUM_DB_HOST || process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.FORUM_DB_PORT || process.env.DB_PORT || '3306'),
    user: process.env.FORUM_DB_USER || process.env.DB_USER || 'root',
    password: process.env.FORUM_DB_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.FORUM_DB_NAME || 'rap_beats_forum_dev',
    charset: 'utf8mb4',
  });

  console.log('== 1/5 创建测试账号 ==');
  const userIds = {};
  const future = new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  for (const u of USERS) {
    const hash = bcrypt.hashSync(u.password, 10);
    const [result] = await conn.execute(
      `INSERT INTO users (username, email, password_hash, role, vip_level, vip_expire_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role),
         vip_level = VALUES(vip_level), vip_expire_at = VALUES(vip_expire_at)`,
      [u.username, u.email, hash, u.role, u.vip, u.vip === 'free' ? null : future]
    );
    const [rows] = await conn.query('SELECT id FROM users WHERE username = ?', [u.username]);
    userIds[u.username] = rows[0].id;
    console.log(`  - ${u.username} (id=${rows[0].id}, ${u.role}, vip=${u.vip})`);
  }

  console.log('== 2/5 补齐 beats 元数据 ==');
  const [beats] = await conn.query('SELECT id, duration, is_free, is_vip_only FROM beats ORDER BY id');
  let updated = 0;
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    const idx = i % GENRES.length;
    const genre = GENRES[idx];
    const key = KEYS[idx];
    const bpm = 80 + ((i * 7) % 86);
    const duration = b.duration > 0 ? b.duration : 180;
    let isFree = i % 5 === 0 ? 1 : 0;
    const isVipOnly = i % 9 === 0 ? 1 : 0;
    if (isVipOnly) isFree = 0;
    await conn.execute(
      `UPDATE beats SET genre = ?, \`key\` = ?, bpm = ?, duration = ?, tags = ?, is_free = ?, is_vip_only = ? WHERE id = ?`,
      [genre, key, bpm, duration, JSON.stringify(['测试', genre]), isFree, isVipOnly, b.id]
    );

    // 每 4 条关联一个 rapper（建 beat_producers 多对多记录）
    if (i % 4 === 0) {
      const rapperName = RAPPER_NAMES[(i / 4) % RAPPER_NAMES.length];
      const [rp] = await conn.query('SELECT id FROM rappers WHERE name = ?', [rapperName]);
      if (rp[0]) {
        await conn.execute('UPDATE beats SET rapper = ? WHERE id = ?', [rapperName, b.id]);
        await conn.execute(
          `INSERT INTO beat_producers (beat_id, rapper_id, rapper_name) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE rapper_id = VALUES(rapper_id)`,
          [b.id, rp[0].id, rapperName]
        );
      }
    }
    updated++;
  }
  console.log(`  - 已更新 ${updated} 条 beat（曲风/BPM/调性/时长/免费/VIP/rapper）`);

  console.log('== 2.5/5 确保 Rapper 存在 ==');
  for (const name of RAPPER_NAMES) {
    await conn.execute(
      `INSERT IGNORE INTO rappers (name, bio, sort_order) VALUES (?, ?, 0)`,
      [name, '种子数据 Rapper']
    );
  }
  console.log(`  - 已确认 ${RAPPER_NAMES.length} 个 Rapper`);

  console.log('== 3/5 播种论坛积分与签到 ==');
  for (const [name, points] of Object.entries(POINTS)) {
    const uid = userIds[name];
    if (!uid) continue;
    await forumConn.execute(
      `INSERT INTO forum_user_points (user_id, total_points) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE total_points = VALUES(total_points)`,
      [uid, points]
    );
  }
  // tester_free 连续签到 2 天（用于展示连续签到）
  const tf = userIds['tester_free'];
  for (const daysAgo of [1, 2]) {
    const d = new Date(Date.now() - daysAgo * 86400000);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await forumConn.execute(
      `INSERT IGNORE INTO forum_sign_ins (user_id, sign_date, points) VALUES (?, ?, 1)`,
      [tf, dateStr]
    );
  }
  console.log('  - 积分已初始化，tester_free 已补 2 天签到');

  console.log('== 4/5 播种收藏/下载/播放数据 ==');
  const [beatRows] = await conn.query('SELECT id FROM beats ORDER BY id LIMIT 5');
  if (beatRows.length >= 2 && tf) {
    await conn.execute('INSERT IGNORE INTO favorites (user_id, beat_id) VALUES (?, ?)', [tf, beatRows[0].id]);
    await conn.execute('INSERT IGNORE INTO favorites (user_id, beat_id) VALUES (?, ?)', [tf, beatRows[1].id]);
    await conn.execute(
      'INSERT INTO downloads (user_id, beat_id) SELECT ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM downloads WHERE user_id = ? AND beat_id = ?)',
      [tf, beatRows[0].id, tf, beatRows[0].id]
    );
    for (const bid of [beatRows[0].id, beatRows[1].id]) {
      await conn.execute(
        'INSERT INTO play_events (user_id, beat_id) SELECT ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM play_events WHERE user_id = ? AND beat_id = ?)',
        [tf, bid, tf, bid]
      );
      await conn.execute(
        'INSERT INTO preview_history (user_id, beat_id, preview_date) SELECT ?, ?, CURDATE() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM preview_history WHERE user_id = ? AND beat_id = ? AND preview_date = CURDATE())',
        [tf, bid, tf, bid]
      );
    }
  }
  console.log('  - 收藏/下载/播放事件已播种');

  console.log('== 5/5 创建带媒体内容的论坛帖子 ==');
  const posts = [
    {
      title: '【测试数据】Trap 伴奏创作思路分享',
      content: '这是一条种子数据帖子：聊聊 Trap 编曲里 808 与 hi-hat 的节奏组合，欢迎测试人员点评交流。',
      category_id: 1,
      images: JSON.stringify([DEV_COVER]),
      music_file: null,
      music_title: null,
      music_artist: null,
      music_genre: null,
      music_bpm: null,
      music_cover_image: null,
    },
    {
      title: '【测试数据】HIT-SONG 赏析：鼓点与副歌记忆点',
      content: '带音频的赏析帖：分析经典热单的编曲鼓点、副歌记忆点与现场氛围，配有测试音频。',
      category_id: 4,
      images: '[]',
      music_file: DEV_AUDIO,
      music_title: '测试赏析音频',
      music_artist: 'tester_free',
      music_genre: 'Trap',
      music_bpm: 140,
      music_cover_image: null,
    },
    {
      title: '【测试数据】新人报到：大家好',
      content: '刚接触说唱不久，想找个地方学习交流。多多关照！',
      category_id: 7,
      images: '[]',
      music_file: null,
      music_title: null,
      music_artist: null,
      music_genre: null,
      music_bpm: null,
      music_cover_image: null,
    },
  ];
  for (const p of posts) {
    await forumConn.execute(
      `INSERT INTO forum_posts (user_id, category_id, title, content, images, music_file, music_title, music_artist, music_genre, music_bpm, music_cover_image, topic_ids, status)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'published'
       FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM forum_posts WHERE title = ?)`,
      [tf, p.category_id, p.title, p.content, p.images, p.music_file, p.music_title, p.music_artist, p.music_genre, p.music_bpm, p.music_cover_image, p.title]
    );
  }
  console.log('  - 3 条带内容/媒体的帖子已创建');

  console.log('== 5.5/5 创建公开 Banner（dev/ 资源） ==');
  await conn.execute(
    `INSERT INTO banners (name, image_url, link_url, sort_order, is_active, overlay_opacity, display_duration)
     SELECT ?, ?, ?, 0, 1, 0.35, 5
     FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM banners WHERE name = ?)`,
    ['【测试数据】首页 Banner（dev OSS）', DEV_BANNER, 'https://example.com/beats', '【测试数据】首页 Banner（dev OSS）']
  );
  console.log('  - Banner 已创建');

  await conn.end();
  await forumConn.end();
  console.log('\n种子数据完成 ✅');
  console.log('测试账号密码：普通用户统一 Test@123456，管理员 Admin@123456');
}

main().catch((err) => {
  console.error('种子脚本失败:', err);
  process.exit(1);
});
