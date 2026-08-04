import { getDatabaseClient, getForumDatabaseClient, initMySqlDatabaseClientFromEnv } from './client.js';

export { getDatabaseClient, getForumDatabaseClient, initMySqlDatabaseClientFromEnv };

export async function initDatabase(db: import('./client.js').DatabaseClient, forumDb: import('./client.js').DatabaseClient) {

  // rappers 表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS rappers (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL UNIQUE,
      avatar_url TEXT NULL,
      bio TEXT NULL,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 为已有的 beats 表添加 rapper 字段（如果不存在）
  try {
    await db.execute('ALTER TABLE beats ADD COLUMN rapper VARCHAR(100) DEFAULT NULL AFTER producer');
    await db.execute('CREATE INDEX idx_beats_rapper ON beats(rapper)');
  } catch (_) { /* ignore if column exists or index exists */ }

  // users 表（必须在 beats 表之前，因为 beats 有 FK 依赖 users）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(50) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_vip TINYINT DEFAULT 0,
      vip_expire_at DATETIME NULL,
      vip_level VARCHAR(20) DEFAULT 'free',
      avatar_url TEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // beats 表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS beats (
      id INT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      producer VARCHAR(255) NOT NULL,
      rapper VARCHAR(100) DEFAULT NULL,
      bpm INT NOT NULL,
      \`key\` VARCHAR(50) NOT NULL,
      genre VARCHAR(100) NOT NULL,
      tags TEXT NULL,
      duration INT NOT NULL,
      file_path TEXT NOT NULL,
      cover_image TEXT NULL,
      download_count INT DEFAULT 0,
      is_free TINYINT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      uploaded_by INT NULL,
      is_vip_only TINYINT DEFAULT 0,
      INDEX idx_beats_created_at (created_at),
      INDEX idx_beats_uploaded_by (uploaded_by),
      INDEX idx_beats_rapper (rapper),
      CONSTRAINT fk_beats_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // beat_producers 表：beat 与 rapper 的多对多关联（支持合作作品）
  // 必须在 beats 表创建之后才能建立 FK
  await db.execute(`
    CREATE TABLE IF NOT EXISTS beat_producers (
      id INT PRIMARY KEY AUTO_INCREMENT,
      beat_id INT NOT NULL,
      rapper_id INT NULL,
      rapper_name VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_beat_rapper (beat_id, rapper_id),
      INDEX idx_beat_producers_beat (beat_id),
      INDEX idx_beat_producers_rapper (rapper_id),
      CONSTRAINT fk_bp_beat FOREIGN KEY (beat_id) REFERENCES beats(id) ON DELETE CASCADE,
      CONSTRAINT fk_bp_rapper FOREIGN KEY (rapper_id) REFERENCES rappers(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 反馈表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NULL,
      type ENUM('bug','suggestion','other') NOT NULL DEFAULT 'other',
      title VARCHAR(100) NOT NULL,
      content TEXT NOT NULL,
      contact VARCHAR(100) NULL,
      status ENUM('pending','replied','closed') NOT NULL DEFAULT 'pending',
      reply TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_feedback_user (user_id),
      INDEX idx_feedback_status (status),
      INDEX idx_feedback_created (created_at),
      CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      beat_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_favorites_user_beat (user_id, beat_id),
      INDEX idx_favorites_user (user_id),
      INDEX idx_favorites_beat (beat_id),
      CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_favorites_beat FOREIGN KEY (beat_id) REFERENCES beats(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS comments (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      beat_id INT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_comments_beat (beat_id),
      INDEX idx_comments_user (user_id),
      CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_comments_beat FOREIGN KEY (beat_id) REFERENCES beats(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS downloads (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      beat_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_downloads_user (user_id),
      INDEX idx_downloads_beat (beat_id),
      CONSTRAINT fk_downloads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_downloads_beat FOREIGN KEY (beat_id) REFERENCES beats(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // beat_license_agreements 表：记录用户对每个 beat 的使用协议同意状态
  await db.execute(`
    CREATE TABLE IF NOT EXISTS beat_license_agreements (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      beat_id INT NOT NULL,
      agreed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_beat (user_id, beat_id),
      INDEX idx_agreements_user (user_id),
      INDEX idx_agreements_beat (beat_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // beat_license_templates 表：使用协议模板（目前所有 beat 共用同一模板）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS beat_license_templates (
      id INT PRIMARY KEY AUTO_INCREMENT,
      version VARCHAR(20) NOT NULL DEFAULT '1.0',
      content TEXT NOT NULL,
      is_active TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 确保至少有一条活跃的默认模板
  const existingTemplate = await db.queryOne<{ id: number }>('SELECT id FROM beat_license_templates WHERE is_active = 1 LIMIT 1');
  if (!existingTemplate) {
    await db.execute(
      `INSERT INTO beat_license_templates (version, content, is_active) VALUES (?, ?, 1)`,
      [
        '1.0',
        `【Beat 使用须知 & 平台协议】

第一章 总则

第一条 欢迎使用本平台（以下简称"平台"）提供的 Beat 下载服务。在您点击"同意并下载"按钮之前，请务必仔细阅读本协议的全部内容。

第二条 本协议是您与平台之间就 Beat 下载及使用所订立的契约。下载 Beat 即表示您已充分理解并自愿接受本协议的全部条款约束。

第三条 平台展示的所有 Beat，其版权归对应制作人或合法授权方所有。平台仅提供展示、试听与下载通道，不享有也不转让任何 Beat 的版权权益。


第二章 允许范围（个人非商业使用）

第四条 以下情形属于本协议允许的使用范围：

（一）个人练习
私下跟唱、练习演唱、自娱自乐录音，仅限个人保存，不对外发布、不传播。

（二）鉴赏学习
鉴赏 Beat 品质、扒谱学习、音乐理论分析、创作灵感参考。

（三）非商业分享
在封闭的无商业性质社群（如家族群、粉丝群、朋友群）中分享翻唱作品；参加平台内举办的非营利性翻唱活动。

（四）社交记录
将翻唱作品作为个人社交动态（如朋友圈、微博）发布，且不以此获取任何经济收益或商业回报。


第三章 严禁行为

第五条 以下行为一律禁止，一经发现，平台有权立即封禁账号并保留追诉权利：

（一）商演使用
酒吧 / 音乐节 / 演唱会等收费演出、票价分成演出、商业品牌活动 / 年会演出、直播间打赏演出、付费驻唱、商业路演等任何形式的有偿演出。

（二）流媒体平台发布
上传至 Spotify / Apple Music / YouTube Music / 网易云音乐 / QQ 音乐 / 酷狗音乐 / 喜马拉雅 / 抖音 / 快手 / B 站 / 小红书等任何音视频平台，通过播放量、广告分成、会员内容等任何方式获取收益或流量变现（含"免费发布但接受粉丝打赏"模式）。

（三）商业发行
将 Beat 用于录制专辑、单曲、EP、Mixtape 并通过 iTunes / Apple Music / Bandcamp / 网易云店铺等任何渠道发售（含付费与免费换量）；用于影视配乐、广告配乐、游戏配乐、有声读物及播客商业化。

（四）综艺 / 选秀 / 比赛
以翻唱作品参加《中国新说唱》《明日之子》《我是歌手》等任何选秀综艺或有奖金 / 奖品 / 签约机会的音乐比赛；参与以"出道""成团"为目的的偶像 / 练习生活动。

（五）License 转让与传播
将 Beat 文件或 License 复制、转让、出售、出借给任何第三方；将 Beat 文件本身上传至百度网盘、夸克网盘、Discord、GitHub 等任何第三方平台供他人下载。

（六）擅自改编
对 Beat 进行未经授权的 Remix、重新编曲、加长 / 缩短、添加人声素材等二次创作并用于商业目的；制作衍生作品或合辑 / Mixtape 并公开发布。

（七）恶意规避与欺骗
通过去水印、修改文件信息等技术手段掩盖 Beat 来源；虚假声称自己为制作人或版权持有者；批量下载 Beat 后打包销售等任何商业变现行为。


第四章 违规风险与后果

第六条 违规使用后果由用户自行承担，平台概不负责：

（一）平台层面
账号永久封禁，下载权限、积分、VIP 资格全部作废，不予退款。

（二）作品层面
流媒体平台收到版权投诉后强制下架，播放记录和收益全部清零。

（三）法律层面
版权方可依据《中华人民共和国著作权法》提起民事诉讼，追讨实际损失及惩罚性赔偿（单次侵权最高可达 50 万元）；情节严重构成犯罪的，依法追究刑事责任。

（四）个人声誉
侵权记录可能影响后续音乐事业发展，平台有权公示违规行为。


第五章 平台声明

第七条 平台仅提供 Beat 的展示、试听与下载服务，不提供也不代理任何商业授权。如需商用（包括但不限于：流媒体发布、商演、综艺、影视配乐、广告），须自行联系 Beat 制作人单独购买商业 License。

第八条 用户在使用 Beat 过程中与其他用户或第三方产生的任何纠纷，与平台无关，平台保留协助权利人依法维权的义务。

第九条 平台有权随时更新本协议，并通过站内公告或弹窗形式通知用户，继续使用即视为接受更新版本。


第六章 附则

第十条 本协议未尽事宜，由平台与用户协商解决。协商不成的，提交平台运营方所在地有管辖权的人民法院管辖。

第十一条 如有商用需求，建议通过正规渠道联系 Beat 制作人购买独家或非独家 License。部分制作人支持在平台内私信联系，商用授权费用由双方自行协商，平台不承担任何交易风险。`
      ]
    );
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS play_events (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      beat_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_play_events_user (user_id),
      INDEX idx_play_events_beat (beat_id),
      INDEX idx_play_events_beat_created_at (beat_id, created_at),
      CONSTRAINT fk_play_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_play_events_beat FOREIGN KEY (beat_id) REFERENCES beats(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS preview_history (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      beat_id INT NOT NULL,
      preview_date DATE NOT NULL,
      device_id VARCHAR(255) NULL,
      ip_address VARCHAR(45) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_preview_history_user_date (user_id, preview_date),
      INDEX idx_preview_history_beat (beat_id),
      INDEX idx_preview_history_device (device_id),
      INDEX idx_preview_history_ip (ip_address),
      CONSTRAINT fk_preview_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_preview_history_beat FOREIGN KEY (beat_id) REFERENCES beats(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      vip_level VARCHAR(20) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      stripe_session_id VARCHAR(255),
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_orders_user (user_id),
      INDEX idx_orders_session (stripe_session_id),
      CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS banners (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      image_url TEXT NOT NULL,
      link_url VARCHAR(500) NULL,
      sort_order INT DEFAULT 0,
      is_active TINYINT DEFAULT 1,
      overlay_opacity INT DEFAULT 45,
      display_duration INT DEFAULT 5,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_banners_sort_order (sort_order),
      INDEX idx_banners_is_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ─── 论坛数据库初始化 ───────────────────────────────────────────────────────
  await initForumDatabase(forumDb);
}

async function initForumDatabase(forumDb: import('./client.js').DatabaseClient) {
  // forum 库依赖主库 user_id，仅通过业务层约束，不建 FK
  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_categories (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(50) NOT NULL,
      slug VARCHAR(50) NOT NULL UNIQUE,
      icon VARCHAR(50) DEFAULT '',
      description VARCHAR(500) DEFAULT '',
      sort_order INT DEFAULT 0,
      is_active TINYINT DEFAULT 1,
      post_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_topics (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(100) NOT NULL,
      category_id INT NOT NULL DEFAULT 1,
      post_count INT DEFAULT 0,
      is_active TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_topic_slug_cat (slug, category_id),
      FOREIGN KEY (category_id) REFERENCES forum_categories(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  try {
    await forumDb.execute('ALTER TABLE forum_topics ADD COLUMN is_active TINYINT DEFAULT 1 AFTER post_count');
  } catch (_) { /* ignore */ }

  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_posts (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      category_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      beat_id INT DEFAULT NULL,
      cover_image VARCHAR(500) DEFAULT NULL,
      music_file VARCHAR(500) DEFAULT NULL,
      music_title VARCHAR(255) DEFAULT NULL,
      music_artist VARCHAR(255) DEFAULT NULL,
      music_genre VARCHAR(100) DEFAULT NULL,
      music_bpm INT DEFAULT NULL,
      music_cover_image VARCHAR(500) DEFAULT NULL,
      images VARCHAR(2000) DEFAULT '[]',
      topic_ids VARCHAR(500) DEFAULT '[]',
      view_count INT DEFAULT 0,
      like_count INT DEFAULT 0,
      comment_count INT DEFAULT 0,
      is_pinned TINYINT DEFAULT 0,
      is_essence TINYINT DEFAULT 0,
      status VARCHAR(20) DEFAULT 'published',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_forum_posts_category (category_id),
      INDEX idx_forum_posts_user (user_id),
      INDEX idx_forum_posts_created (created_at),
      FOREIGN KEY (category_id) REFERENCES forum_categories(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  for (const colDef of [
    'music_title VARCHAR(255) DEFAULT NULL AFTER music_file',
    'music_artist VARCHAR(255) DEFAULT NULL AFTER music_title',
    'music_genre VARCHAR(100) DEFAULT NULL AFTER music_artist',
    'music_bpm INT DEFAULT NULL AFTER music_genre',
    'music_cover_image VARCHAR(500) DEFAULT NULL AFTER music_bpm',
    'video_url VARCHAR(500) DEFAULT NULL AFTER music_cover_image',
    'video_cover VARCHAR(500) DEFAULT NULL AFTER video_url',
    'video_duration INT DEFAULT NULL AFTER video_cover',
  ]) {
    try { await forumDb.execute(`ALTER TABLE forum_posts ADD COLUMN ${colDef}`); } catch (_) { /* ignore */ }
  }

  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_comments (
      id INT PRIMARY KEY AUTO_INCREMENT,
      post_id INT NOT NULL,
      user_id INT NOT NULL,
      parent_id INT DEFAULT NULL,
      content TEXT NOT NULL,
      like_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_forum_comments_post (post_id),
      FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 评论点赞表（Phase 2）
  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_comment_likes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      comment_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_forum_comment_likes (user_id, comment_id),
      INDEX idx_forum_comment_likes_comment (comment_id),
      FOREIGN KEY (comment_id) REFERENCES forum_comments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_likes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      post_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_forum_likes (user_id, post_id),
      INDEX idx_forum_likes_post (post_id),
      FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_favorites (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      post_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_forum_favorites (user_id, post_id),
      INDEX idx_forum_favorites_post (post_id),
      FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_sign_ins (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      sign_date DATE NOT NULL,
      points INT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_forum_sign_ins (user_id, sign_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_user_points (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL UNIQUE,
      total_points INT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_point_transactions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      \`change\` INT NOT NULL,
      reason VARCHAR(50) NOT NULL,
      description VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_time (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 积分抽奖记录表
  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_lottery_records (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      prize_name VARCHAR(100) NOT NULL,
      points INT DEFAULT 0,
      vip_days INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_time (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 积分兑换下载权限记录表
  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_point_download_permissions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      used TINYINT(1) DEFAULT 0,
      used_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_unused (user_id, used),
      INDEX idx_user_time (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Remove "综合" (general) category if exists and migrate its posts
  try {
    const [generalCat] = await forumDb.queryMany<{ id: number }>(
      "SELECT id FROM forum_categories WHERE slug = 'general' OR slug = '综合' LIMIT 1"
    );
    if (generalCat) {
      // Find a replacement category (first non-general)
      const [replacement] = await forumDb.queryMany<{ id: number }>(
        "SELECT id FROM forum_categories WHERE slug != 'general' ORDER BY sort_order LIMIT 1"
      );
      if (replacement) {
        await forumDb.execute(
          'UPDATE forum_posts SET category_id = ? WHERE category_id = ?',
          [replacement.id, generalCat.id]
        );
      }
      await forumDb.execute("DELETE FROM forum_topics WHERE category_id = ?", [generalCat.id]);
      await forumDb.execute("DELETE FROM forum_categories WHERE id = ?", [generalCat.id]);
    }
  } catch (migErr) {
    console.warn('[forum init] migration for removing general category failed:', migErr);
  }

    // Sync categories by slug (id may differ between environments)
    try {
      const syncCategories = [
        { name: '创作', slug: 'creation', icon: '✍️', description: '歌词创作、Freestyle、Flow分享', sort_order: 1 },
        { name: '说唱巅峰对决2026', slug: 'rap-battle-2026', icon: '🎧', description: '说唱巅峰对决2026、比赛、竞演、选手讨论', sort_order: 2 },
        { name: '涂鸦', slug: 'graffiti', icon: '🎨', description: '涂鸦艺术、街头创作分享', sort_order: 3 },
        { name: '说唱 HIT-SONG', slug: 'hit-song', icon: '💃', description: '说唱HIT-SONG、热门单曲、金曲赏析', sort_order: 4 },
        { name: '说唱', slug: 'rap', icon: '🎙️', description: '说唱音乐、rapper故事、说唱文化', sort_order: 5 },
        { name: '免费Beat分享', slug: 'beats', icon: '🎵', description: '免费Beat下载、分享、交流', sort_order: 6 },
        { name: '新人报道', slug: 'newbie', icon: '🌱', description: '新来的朋友来这里报道', sort_order: 7 },
      ];
      for (const cat of syncCategories) {
        const existing = await forumDb.queryOne<{ id: number }>(
          'SELECT id FROM forum_categories WHERE slug = ?',
          [cat.slug]
        );
        if (existing) {
          await forumDb.execute(
            'UPDATE forum_categories SET name = ?, icon = ?, description = ?, sort_order = ? WHERE id = ?',
            [cat.name, cat.icon, cat.description, cat.sort_order, existing.id]
          );
        }
      }
      console.log('[forum init] categories synced');
  } catch (syncErr) {
    console.warn('[forum init] category sync failed:', syncErr);
  }

  // Seed default categories
  const catRows = await forumDb.queryMany<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM forum_categories');
  if ((catRows[0]?.cnt ?? 0) === 0) {
    const categories = [
      { name: '创作', slug: 'creation', icon: '✍️', description: '歌词创作、Freestyle、Flow分享', sort_order: 1 },
      { name: '说唱巅峰对决2026', slug: 'rap-battle-2026', icon: '🎧', description: '说唱巅峰对决2026、比赛、竞演、选手讨论', sort_order: 2 },
      { name: '涂鸦', slug: 'graffiti', icon: '🎨', description: '涂鸦艺术、街头创作分享', sort_order: 3 },
      { name: '说唱 HIT-SONG', slug: 'hit-song', icon: '💃', description: '说唱HIT-SONG、热门单曲、金曲赏析', sort_order: 4 },
      { name: '说唱', slug: 'rap', icon: '🎙️', description: '说唱音乐、rapper故事、说唱文化', sort_order: 5 },
      { name: '免费Beat分享', slug: 'beats', icon: '🎵', description: '免费Beat下载、分享、交流', sort_order: 6 },
      { name: '新人报道', slug: 'newbie', icon: '🌱', description: '新来的朋友来这里报道', sort_order: 7 },
    ];
    for (const cat of categories) {
      await forumDb.execute(
        'INSERT INTO forum_categories (name, slug, icon, description, sort_order) VALUES (?, ?, ?, ?, ?)',
        [cat.name, cat.slug, cat.icon, cat.description, cat.sort_order]
      );
    }
  }

  // ── Topic migration: sync existing topics to correct state ──
  // 按 name + category_slug 匹配，找出需要 UPDATE/INSERT 的话题
  try {
    const dbTopics = await forumDb.queryMany<{ id: number; name: string; slug: string; category_id: number }>(
      'SELECT id, name, slug, category_id FROM forum_topics ORDER BY id'
    );
    // Build category slug map (id → slug)
    const categorySlugMap = new Map<number, string>();
    const dbCats = await forumDb.queryMany<{ id: number; slug: string }>(
      'SELECT id, slug FROM forum_categories'
    );
    for (const c of dbCats) categorySlugMap.set(c.id, c.slug);

    const updates: Array<{ id: number; name: string; slug: string }> = [];
    for (const t of dbTopics) {
      const catSlug = categorySlugMap.get(t.category_id) ?? '';
      const name = t.name;
      if (catSlug === 'rap-battle-2026' && ['DJ技巧', '混音制作', 'Remix'].includes(name)) {
        const map: Record<string, { name: string; slug: string }> = {
          'DJ技巧': { name: '选手讨论', slug: 'rap-battle' },
          '混音制作': { name: '对决解析', slug: 'battle-analysis' },
          'Remix': { name: '舞台表现', slug: 'performance' },
        };
        if (map[name]) updates.push({ id: t.id, ...map[name] });
      }
      if (catSlug === 'hit-song' && ['街舞Breaking', '舞蹈技巧'].includes(name)) {
        const map: Record<string, { name: string; slug: string }> = {
          '街舞Breaking': { name: 'HIT-SONG赏析', slug: 'hit-song' },
          '舞蹈技巧': { name: '经典曲目', slug: 'classic-tracks' },
        };
        if (map[name]) updates.push({ id: t.id, ...map[name] });
      }
    }

    for (const u of updates) {
      await forumDb.execute('UPDATE forum_topics SET name = ?, slug = ? WHERE id = ?', [u.name, u.slug, u.id]);
    }

    // 新人报到版块不存在则插入
    const rapCatId = dbCats.find(c => c.slug === 'rap')?.id;
    const hasNewbie = dbTopics.find(t => t.category_id === rapCatId && t.slug === 'newbie');
    if (!hasNewbie && rapCatId) {
      await forumDb.execute('INSERT INTO forum_topics (name, slug, category_id) VALUES (?, ?, ?)', ['新人报到', 'newbie', rapCatId]);
    }

    // 移除创作版块中的夏日话题
    const creationCatId = dbCats.find(c => c.slug === 'creation')?.id;
    if (creationCatId) {
      await forumDb.execute("DELETE FROM forum_topics WHERE slug = 'summer' AND category_id = ?", [creationCatId]);
    }

    if (updates.length > 0 || !hasNewbie) {
      console.log(`[forum init] topics migrated (${updates.length} updated)`);
    }
  } catch (topicMigErr) {
    console.warn('[forum init] topic migration failed:', topicMigErr);
  }

  // Seed default topics
  const topicRows = await forumDb.queryMany<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM forum_topics');
  if ((topicRows[0]?.cnt ?? 0) === 0) {
    const catSlugToId = new Map<string, number>();
    const dbCats = await forumDb.queryMany<{ id: number; slug: string }>(
      'SELECT id, slug FROM forum_categories'
    );
    for (const c of dbCats) catSlugToId.set(c.slug, c.id);

    const topics = [
      // 创作
      { name: '说唱技巧', slug: 'technique', catSlug: 'creation' },
      { name: 'Beat鉴赏', slug: 'beat-review', catSlug: 'creation' },
      { name: '歌词分享', slug: 'lyrics', catSlug: 'creation' },
      { name: 'Freestyle', slug: 'freestyle', catSlug: 'creation' },
      // 说唱巅峰对决2026
      { name: '选手讨论', slug: 'rap-battle', catSlug: 'rap-battle-2026' },
      { name: '对决解析', slug: 'battle-analysis', catSlug: 'rap-battle-2026' },
      { name: '舞台表现', slug: 'performance', catSlug: 'rap-battle-2026' },
      // 涂鸦
      { name: '涂鸦插画', slug: 'graffiti', catSlug: 'graffiti' },
      { name: '街头艺术', slug: 'street-art', catSlug: 'graffiti' },
      { name: '插画分享', slug: 'illustration', catSlug: 'graffiti' },
      // 说唱 HIT-SONG
      { name: 'HIT-SONG赏析', slug: 'hit-song', catSlug: 'hit-song' },
      { name: '经典曲目', slug: 'classic-tracks', catSlug: 'hit-song' },
      // 说唱
      { name: '音乐风格', slug: 'genre-talk', catSlug: 'rap' },
      { name: '中文说唱', slug: 'chinese-rap', catSlug: 'rap' },
      { name: '情感说唱', slug: 'emotion', catSlug: 'rap' },
      { name: '歌词分享', slug: 'lyrics', catSlug: 'rap' },
      { name: 'Beat鉴赏', slug: 'beat-review', catSlug: 'rap' },
      { name: '说唱技巧', slug: 'technique', catSlug: 'rap' },
      // 免费Beat分享
      { name: 'Beat鉴赏', slug: 'beat-review', catSlug: 'beats' },
      { name: 'Beat制作', slug: 'beat-production', catSlug: 'beats' },
      // 新人报道
      { name: '新人报到', slug: 'newbie', catSlug: 'newbie' },
    ];
    for (const topic of topics) {
      const catId = catSlugToId.get(topic.catSlug);
      if (!catId) continue; // skip if category doesn't exist
      await forumDb.execute(
        'INSERT INTO forum_topics (name, slug, category_id) VALUES (?, ?, ?)',
        [topic.name, topic.slug, catId]
      );
    }
  }
}

export type Beat = {
  id: number;
  title: string;
  producer: string;
  rapper: string | null;
  bpm: number;
  key: string;
  genre: string;
  tags: string | null;
  duration: number;
  file_path: string;
  cover_image: string | null;
  download_count: number;
  is_free: number;
  created_at: string;
};
