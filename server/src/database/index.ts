/**
 * 数据库初始化 — schema 单一来源
 *
 * ⚠️ 这是项目所有表结构的权威定义。任何 ALTER / 新表 / 新字段必须在这里加,
 *    不要在 backups/*.sql 或 scripts/*.ts 里手动改库。
 *
 * 历史快照:
 * - backups/production-snapshot-20260822/*.sql 是 2026-08-22 抓的线上库 dump,
 *   仅作历史参考,不再维护。新机器初始化数据库时由 initDatabase() 自动完成。
 *
 * 设计原则:
 * - 用 CREATE TABLE IF NOT EXISTS,新表自动创建
 * - 老表加字段用 ALTER TABLE try-catch 包裹,错误吞掉(列已存在则跳过)
 * - 字段顺序在 CREATE TABLE 内显式声明,ALTER 时也指定位置
 *   (避免线上 MySQL 默认排序影响 ALTER 行为)
 * - 数据迁移逻辑(比如 remove general category、sync topics)
 *   放在 init 函数末尾,幂等执行
 */
import { getDatabaseClient, getForumDatabaseClient, getMembershipDatabaseClient, initMySqlDatabaseClientFromEnv } from './client.js';

export { getDatabaseClient, getForumDatabaseClient, getMembershipDatabaseClient, initMySqlDatabaseClientFromEnv };

export async function initDatabase(
  db: import('./client.js').DatabaseClient,
  forumDb: import('./client.js').DatabaseClient,
  membershipDb: import('./client.js').DatabaseClient,
) {

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

  // beats.creator_role 字段：标记作品来自 admin / beatmaker / rappers_only
  try {
    await db.execute("ALTER TABLE beats ADD COLUMN creator_role ENUM('admin','beatmaker','rappers_only') NOT NULL DEFAULT 'admin' AFTER uploaded_by");
    await db.execute('CREATE INDEX idx_beats_creator_role ON beats(creator_role)');
  } catch (_) { /* ignore if column exists or index exists */ }

  // users 表（必须在 beats 表之前，因为 beats 有 FK 依赖 users）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(50) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      phone VARCHAR(20) NULL,
      role VARCHAR(20) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_vip TINYINT DEFAULT 0,
      vip_expire_at DATETIME NULL,
      vip_level VARCHAR(20) DEFAULT 'free',
      avatar_url TEXT NULL,
      INDEX idx_users_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 确保 phone 字段存在（已有表升级时）
  try { await db.execute("ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL AFTER password_hash"); } catch (_) { /* ignore */ }
  try { await db.execute("CREATE INDEX idx_users_phone ON users(phone)"); } catch (_) { /* ignore */ }

  // Beatmaker 认证字段（已有表升级时）
  try { await db.execute("ALTER TABLE users ADD COLUMN is_beatmaker TINYINT DEFAULT 0 AFTER vip_level"); } catch (_) { /* ignore */ }
  try { await db.execute("ALTER TABLE users ADD COLUMN beatmaker_certified_at DATETIME NULL AFTER is_beatmaker"); } catch (_) { /* ignore */ }
  try { await db.execute("CREATE INDEX idx_users_is_beatmaker ON users(is_beatmaker)"); } catch (_) { /* ignore */ }

  // Beatmaker 申请表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS beatmaker_applications (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      real_name VARCHAR(50) NOT NULL,
      id_card_no_enc TEXT NOT NULL,
      portfolio_url VARCHAR(500) NULL,
      sample_work_url VARCHAR(500) NULL,
      sample_audio_url VARCHAR(500) NULL,
      bio TEXT NULL,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      reject_reason VARCHAR(500) NULL,
      reviewed_by INT NULL,
      reviewed_at DATETIME NULL,
      last_rejected_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_bmapp_user_id (user_id),
      INDEX idx_bmapp_status (status),
      INDEX idx_bmapp_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // P1-A 加固：同一用户仅允许存在 1 条 status='pending' 的申请（历史 approved/rejected 允许多条）
  const bmAppColExists = await db.queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'beatmaker_applications'
        AND COLUMN_NAME = 'pending_user_unique'`
  );
  if (!bmAppColExists || bmAppColExists.c === 0) {
    await db.execute(
      'ALTER TABLE beatmaker_applications ' +
      "ADD COLUMN pending_user_unique INT AS (IF(status = 'pending', user_id, NULL)) STORED"
    );
  }
  const bmAppUniqueExists = await db.queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'beatmaker_applications'
        AND INDEX_NAME = 'uk_beatmaker_applications_pending_user'`
  );
  if (!bmAppUniqueExists || bmAppUniqueExists.c === 0) {
    // 先删同用户多条 pending 的尾巴（保留 id 最小），保证 ALTER UNIQUE 可成功
    await db.execute(`
      DELETE t FROM beatmaker_applications t
      JOIN beatmaker_applications k
        ON k.user_id = t.user_id AND k.status = t.status
      WHERE t.status = 'pending' AND k.status = 'pending' AND k.id < t.id
    `);
    await db.execute(
      'ALTER TABLE beatmaker_applications ' +
      'ADD UNIQUE KEY uk_beatmaker_applications_pending_user (pending_user_unique)'
    );
  }

  // Beatmaker application: add sample_audio_url column (migrate existing tables)
  const bmAppAudioColExists = await db.queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'beatmaker_applications'
        AND COLUMN_NAME = 'sample_audio_url'`
  );
  if (!bmAppAudioColExists || bmAppAudioColExists.c === 0) {
    try {
      await db.execute(
        'ALTER TABLE beatmaker_applications ADD COLUMN sample_audio_url VARCHAR(500) NULL AFTER sample_work_url'
      );
    } catch (_) { /* ignore if already exists */ }
  }

  // Beatmaker 认证通过后的资料表（1:1 with users）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS beatmaker_profiles (
      user_id INT PRIMARY KEY,
      display_name VARCHAR(100) NOT NULL,
      avatar_url TEXT NULL,
      bio TEXT NULL,
      portfolio_url VARCHAR(500) NULL,
      sample_audio_url VARCHAR(500) NULL,
      certified_at DATETIME NOT NULL,
      total_beats INT NOT NULL DEFAULT 0,
      total_likes INT NOT NULL DEFAULT 0,
      total_downloads INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
  // P0-B 加固：同一用户同一伴奏同一天只应计 1 次下载，避免下载额度与 download_count 被多扣。
  // 采用 STORED generated column + 复合 UNIQUE 实现幂等。
  const downloadsDateColExists = await db.queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'downloads'
        AND COLUMN_NAME = 'created_date'
      LIMIT 1`
  );
  if (!downloadsDateColExists || downloadsDateColExists.c === 0) {
    await db.execute(
      'ALTER TABLE downloads ADD COLUMN created_date DATE AS (DATE(created_at)) STORED'
    );
  }
  const downloadsUniqueExists = await db.queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'downloads'
        AND INDEX_NAME = 'uk_downloads_user_beat_date'
      LIMIT 1`
  );
  if (!downloadsUniqueExists || downloadsUniqueExists.c === 0) {
    // 先删同日重复（保留 id 最小），确保老库 ALTER 能成功
    await db.execute(`
      DELETE t FROM downloads t
      LEFT JOIN (
        SELECT MIN(id) keep_id
          FROM downloads
         GROUP BY user_id, beat_id, DATE(created_at)
      ) k ON t.id = k.keep_id
      WHERE k.keep_id IS NULL
    `);
    await db.execute(
      'ALTER TABLE downloads ADD UNIQUE KEY uk_downloads_user_beat_date (user_id, beat_id, created_date)'
    );
  }

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

  // beat_license_templates：单活跃模板约束（仅当 is_active=1 时全局唯一，允许多条非活跃历史版本）
  const activeCol = await db.queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'beat_license_templates'
       AND COLUMN_NAME = 'active_flag_unique'
     LIMIT 1`
  );
  if (!activeCol || activeCol.c === 0) {
    await db.execute(
      `ALTER TABLE beat_license_templates
       ADD COLUMN active_flag_unique INT AS (IF(is_active = 1, 1, NULL)) STORED`
    );
  }
  const activeUnique = await db.queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'beat_license_templates'
       AND INDEX_NAME = 'uk_beat_license_active_flag'
       AND NON_UNIQUE = 0
     LIMIT 1`
  );
  if (!activeUnique || activeUnique.c === 0) {
    // 清理已有的多条 active：仅保留最大 id 那条
    await db.execute(`
      UPDATE beat_license_templates SET is_active = 0
      WHERE is_active = 1
        AND id < (SELECT keep FROM (SELECT MAX(id) AS keep FROM beat_license_templates WHERE is_active = 1) t)
    `);
    await db.execute('ALTER TABLE beat_license_templates ADD UNIQUE KEY uk_beat_license_active_flag (active_flag_unique)');
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
  // P0-A 加固：防止 preview_history 重复写入导致试听限额被多算。
  // 登录态统一写入 device_id='LOGGED-IN' / ip_address=''，匿名态写入真实 device/ip，
  // 以 (user_id, beat_id, preview_date, device_id, ip_address) 为复合唯一键。
  const previewUniqueExists = await db.queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'preview_history'
        AND INDEX_NAME = 'uk_preview_history_uniq'
      LIMIT 1`
  );
  if (!previewUniqueExists || previewUniqueExists.c === 0) {
    // 若仍存在 NULL，则先转成占位，确保 UNIQUE 对登录态生效
    await db.execute(
      "UPDATE preview_history SET device_id = 'LOGGED-IN', ip_address = '' " +
      'WHERE device_id IS NULL AND ip_address IS NULL'
    );
    await db.execute('UPDATE preview_history SET device_id = IFNULL(device_id, "") WHERE device_id IS NULL');
    await db.execute('UPDATE preview_history SET ip_address   = IFNULL(ip_address,  "") WHERE ip_address   IS NULL');
    // 先删重复（保留 id 最小），再 ALTER ADD UNIQUE，保证老环境也能成功
    await db.execute(`
      DELETE t FROM preview_history t
      LEFT JOIN (
        SELECT MIN(id) keep_id
          FROM preview_history
         GROUP BY user_id, beat_id, preview_date,
                  LEFT(IFNULL(device_id,''), 255),
                  LEFT(IFNULL(ip_address,''), 45)
      ) k ON t.id = k.keep_id
      WHERE k.keep_id IS NULL
    `);
    await db.execute(
      'ALTER TABLE preview_history ' +
      'ADD UNIQUE KEY uk_preview_history_uniq ' +
      '(user_id, beat_id, preview_date, device_id(255), ip_address(45))'
    );
  }

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

  // ─── 首页尾部内容配置 + FAQ ────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS home_footer_config (
      id INT PRIMARY KEY AUTO_INCREMENT,
      config_key VARCHAR(64) NOT NULL UNIQUE,
      config_value LONGTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS home_footer_faqs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      category VARCHAR(50) DEFAULT '通用',
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      sort_order INT DEFAULT 0,
      is_active TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_home_footer_faqs_sort (sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 防止 FAQ 重复插入：同一分类下不允许问题文案完全相同
  const faqUniqueExists = await db.queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'home_footer_faqs'
       AND INDEX_NAME = 'uk_home_footer_faqs_cat_question'
     LIMIT 1`
  );
  if (!faqUniqueExists || faqUniqueExists.c === 0) {
    await db.execute(
      'ALTER TABLE home_footer_faqs ADD UNIQUE KEY uk_home_footer_faqs_cat_question (category, question(255))'
    );
  }

  // ─── banners：禁止同名 banner（便于后台列表去重、防止重复上传） ────────────
  const bannerNameUnique = await db.queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'banners'
       AND INDEX_NAME = 'uk_banners_name'
       AND NON_UNIQUE = 0
     LIMIT 1`
  );
  if (!bannerNameUnique || bannerNameUnique.c === 0) {
    // 先清理已有重复：按 name 分组只保留最小 id
    await db.execute(`
      DELETE t1 FROM banners t1
      INNER JOIN banners t2
        ON t1.name = t2.name AND t1.id > t2.id
    `);
    await db.execute('ALTER TABLE banners ADD UNIQUE KEY uk_banners_name (name)');
  }

  // ─── orders：升级 stripe_session_id 普通索引为 UNIQUE（去重时保留最小 id） ────
  const ordersSessionUnique = await db.queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'orders'
       AND INDEX_NAME = 'uk_orders_stripe_session_id'
       AND NON_UNIQUE = 0
     LIMIT 1`
  );
  if (!ordersSessionUnique || ordersSessionUnique.c === 0) {
    // 若存在老的同名普通索引先 DROP；重复行按 stripe_session_id 保留最小 id（NULL 行全部保留，UNIQUE 允许多个 NULL）
    try {
      await db.execute('ALTER TABLE orders DROP INDEX idx_orders_session');
    } catch (_e) { /* 忽略：可能不存在 */ }
    await db.execute(`
      DELETE t1 FROM orders t1
      INNER JOIN orders t2
        ON t1.stripe_session_id = t2.stripe_session_id
       AND t1.stripe_session_id IS NOT NULL
       AND t1.id > t2.id
    `);
    await db.execute('ALTER TABLE orders ADD UNIQUE KEY uk_orders_stripe_session_id (stripe_session_id)');
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      email VARCHAR(255) NOT NULL UNIQUE,
      source VARCHAR(20) DEFAULT 'footer',
      is_active TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const existingFooterConfig = await db.queryOne<{ id: number }>(
    'SELECT id FROM home_footer_config WHERE config_key = ? LIMIT 1',
    ['home_footer']
  );
  if (!existingFooterConfig) {
    const defaultFooterConfig = {
      licenseCards: [
        { id: 'personal', icon: '🎧', title: '个人非商用', description: '下载后可用于个人练习、翻唱记录和非商业分享，请勿用于商演或流媒体发布。', ctaText: '了解限制', ctaUrl: '/vip', sortOrder: 1, isActive: true },
        { id: 'commercial', icon: '💼', title: '商用 License', description: '流媒体发布、商演、影视与广告配乐等需单独联系制作人购买商用授权，平台不代理交易。', ctaText: '联系制作人', ctaUrl: '/forum/messages', sortOrder: 2, isActive: true },
        { id: 'exclusive', icon: '👑', title: '独家 / 买断', description: '需要专属定制或独占使用权？与制作人私信协商独家与非独家授权。', ctaText: '私信协商', ctaUrl: '/forum/messages', sortOrder: 3, isActive: true }
      ],
      creatorCta: { title: '你是 Beatmaker？', subtitle: '上传你的作品，加入 Rapper 频道，让更多音乐人听见。', buttonText: '上传作品', buttonUrl: '/upload', isActive: true },
      stats: [
        { id: 'beats', label: '优质 Beat', value: '', auto: 'totalBeats', sortOrder: 1, isActive: true },
        { id: 'rappers', label: '合作制作人', value: '', auto: 'totalRappers', sortOrder: 2, isActive: true },
        { id: 'downloads', label: '累计下载', value: '', auto: 'totalDownloads', sortOrder: 3, isActive: true },
        { id: 'users', label: '注册用户', value: '', auto: 'totalUsers', sortOrder: 4, isActive: true }
      ],
      links: [
        { id: 'beats', label: '发现伴奏', url: '/beats', group: 'quick' },
        { id: 'free', label: '免费专区', url: '/beats?is_free=1', group: 'quick' },
        { id: 'vip', label: 'VIP 会员', url: '/vip', group: 'service' },
        { id: 'points', label: '积分中心', url: '/points', group: 'service' },
        { id: 'forum', label: '论坛社区', url: '/forum', group: 'community' },
        { id: 'license', label: '使用协议', url: '/vip', group: 'support' }
      ],
      compliance: {
        copyrightText: '© 2026 Rap Beats · 平台仅提供 Beat 展示、试听与下载服务，版权归制作人或合法授权方所有',
        icp: '',
        icpUrl: 'https://beian.miit.gov.cn/',
        police: '',
        policeUrl: '',
        email: 'contact@rapbeats.example.com',
        emailLabel: '商务合作 / 联系我们'
      },
      membershipSection: { isActive: true, title: '会员权益', subtitle: '选择适合你的创作节奏' },
      rappersSection: { isActive: true, title: '热门制作人', subtitle: '跟着优秀的 Beatmaker 找到你的声音', count: 6 },
      chartsSection: { isActive: true, title: '热门榜单', subtitle: '下载 / 收藏 / 播放实时排行', count: 5 },
      subscribeSection: { isActive: true, title: '新 Beat 上架提醒', subtitle: '订阅后第一时间收到上新通知', buttonText: '订阅' }
    };
    await db.execute(
      'INSERT INTO home_footer_config (config_key, config_value) VALUES (?, ?)',
      ['home_footer', JSON.stringify(defaultFooterConfig)]
    );
  }

  const existingFaqCount = await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM home_footer_faqs');
  if ((existingFaqCount?.count ?? 0) === 0) {
    const defaultFaqs = [
      { category: '授权与版权', question: '下载 Beat 后可以直接商用吗？', answer: '不可以。普通下载仅限个人非商业使用；如需商用（流媒体发布、商演、影视/广告配乐等），须联系制作人单独购买商用 License。', sort_order: 1 },
      { category: '授权与版权', question: '如何联系 Beat 制作人？', answer: '登录后进入论坛或私信功能，搜索制作人并发起私信协商商用授权。', sort_order: 2 },
      { category: '会员与积分', question: 'VIP 会员有什么权益？', answer: '基础、高级、至尊会员对应不同的每日下载次数、音质与专属标识，详见会员页。', sort_order: 3 },
      { category: '会员与积分', question: '积分有什么用？', answer: '积分可用于签到、抽奖和兑换下载权限，详见积分中心。', sort_order: 4 }
    ];
    for (const faq of defaultFaqs) {
      await db.execute(
        'INSERT INTO home_footer_faqs (category, question, answer, sort_order, is_active) VALUES (?, ?, ?, ?, 1)',
        [faq.category, faq.question, faq.answer, faq.sort_order]
      );
    }
  }

  // ─── 论坛数据库初始化 ───────────────────────────────────────────────────────
  await initForumDatabase(forumDb);

  // ─── 会员数据库初始化(积分 + VIP) ────────────────────────────────────────
  await initMembershipDatabase(membershipDb);
}

async function initMembershipDatabase(membershipDb: import('./client.js').DatabaseClient) {
  // 用户积分余额表(从 forum_user_points 迁移而来)
  await membershipDb.execute(`
    CREATE TABLE IF NOT EXISTS user_points (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL UNIQUE,
      total_points INT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 积分流水表(从 forum_point_transactions 迁移而来)
  await membershipDb.execute(`
    CREATE TABLE IF NOT EXISTS point_transactions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      \`change\` INT NOT NULL,
      reason VARCHAR(50) NOT NULL,
      description VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_time (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 积分兑换下载权限表(从 forum_point_download_permissions 迁移而来)
  await membershipDb.execute(`
    CREATE TABLE IF NOT EXISTS point_download_permissions (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      used TINYINT(1) DEFAULT 0,
      used_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_unused (user_id, used),
      INDEX idx_user_time (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // VIP 用户状态表(真相源 source of truth)
  await membershipDb.execute(`
    CREATE TABLE IF NOT EXISTS vip_users (
      user_id INT NOT NULL,
      vip_level VARCHAR(20) NOT NULL DEFAULT 'free',
      is_vip TINYINT(1) NOT NULL DEFAULT 0,
      vip_expire_at DATETIME NULL,
      source ENUM('payment','lottery','admin_grant','system') NOT NULL DEFAULT 'payment',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id),
      KEY idx_level_expire (vip_level, vip_expire_at),
      KEY idx_is_vip (is_vip)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // VIP 订单表(从 orders 提取 vip_level!='free' 的)
  await membershipDb.execute(`
    CREATE TABLE IF NOT EXISTS vip_orders (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      vip_level VARCHAR(20) NOT NULL,
      amount_cents INT NOT NULL DEFAULT 0,
      duration_days INT NOT NULL DEFAULT 30,
      status ENUM('pending','paid','completed','refunded','cancelled') NOT NULL DEFAULT 'pending',
      external_order_no VARCHAR(100) DEFAULT NULL,
      paid_at DATETIME NULL,
      expire_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id),
      INDEX idx_status (status),
      INDEX idx_external (external_order_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // vip_orders：升级 external_order_no 为 UNIQUE，防止同一外部订单重复入账
  const vipOrdersExternalUnique = await membershipDb.queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'vip_orders'
       AND INDEX_NAME = 'uk_vip_orders_external_order_no'
       AND NON_UNIQUE = 0
     LIMIT 1`
  );
  if (!vipOrdersExternalUnique || vipOrdersExternalUnique.c === 0) {
    try {
      await membershipDb.execute('ALTER TABLE vip_orders DROP INDEX idx_external');
    } catch (_e) { /* 忽略 */ }
    await membershipDb.execute(`
      DELETE t1 FROM vip_orders t1
      INNER JOIN vip_orders t2
        ON t1.external_order_no = t2.external_order_no
       AND t1.external_order_no IS NOT NULL
       AND t1.id > t2.id
    `);
    await membershipDb.execute(
      'ALTER TABLE vip_orders ADD UNIQUE KEY uk_vip_orders_external_order_no (external_order_no)'
    );
  }

  // VIP 等级字典
  await membershipDb.execute(`
    CREATE TABLE IF NOT EXISTS vip_levels (
      level VARCHAR(20) PRIMARY KEY,
      display_name VARCHAR(50) NOT NULL,
      duration_days INT NOT NULL,
      price_cents INT NOT NULL,
      description VARCHAR(255) DEFAULT '',
      sort_order INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Seed VIP 等级字典(幂等)
  const existingLevels = await membershipDb.queryMany<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM vip_levels');
  if ((existingLevels[0]?.cnt ?? 0) === 0) {
    const levels = [
      { level: 'free',     display_name: '免费用户', duration_days: 0,   price_cents: 0,     description: '默认等级,无任何特权', sort_order: 0 },
      { level: 'basic',    display_name: '基础会员', duration_days: 30,  price_cents: 2900,  description: '基础下载权限 / 普通音质', sort_order: 1 },
      { level: 'premium',  display_name: '高级会员', duration_days: 30,  price_cents: 5900,  description: '无损音质 / 抢先听', sort_order: 2 },
      { level: 'ultimate', display_name: '至尊会员', duration_days: 365, price_cents: 29900, description: '全部权限 / 商用授权', sort_order: 3 },
    ];
    for (const lv of levels) {
      await membershipDb.execute(
        'INSERT INTO vip_levels (level, display_name, duration_days, price_cents, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [lv.level, lv.display_name, lv.duration_days, lv.price_cents, lv.description, lv.sort_order],
      );
    }
  }
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

  // 积分抽奖记录表（vip_days 是快照字段,VIP 状态由 membership.vip_users 主导）
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

  // forum_user_points / forum_point_transactions / forum_point_download_permissions
  // 已迁移到 rap_beats_membership 库,这里不再初始化

  // ── 私信功能 ────────────────────────────────────────────────────────────────
  // 会话表
  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_conversations (
      id VARCHAR(64) PRIMARY KEY,
      participant_a INT NOT NULL COMMENT '较小的用户ID',
      participant_b INT NOT NULL COMMENT '较大的用户ID',
      last_message_content TEXT,
      last_message_at DATETIME,
      unread_count_a INT DEFAULT 0,
      unread_count_b INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_participants (participant_a, participant_b)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 消息表
  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_messages (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      conversation_id VARCHAR(64) NOT NULL,
      sender_id INT NOT NULL,
      receiver_id INT NOT NULL,
      content TEXT NOT NULL,
      message_type ENUM('text', 'image', 'system') DEFAULT 'text',
      is_read TINYINT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_conversation (conversation_id, created_at),
      INDEX idx_receiver_unread (receiver_id, is_read),
      FOREIGN KEY (conversation_id) REFERENCES forum_conversations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── 用户资料与关注功能 ──────────────────────────────────────────────────────
  // 用户资料表
  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_user_profiles (
      user_id INT PRIMARY KEY,
      bio VARCHAR(500) DEFAULT '',
      location VARCHAR(100) DEFAULT '',
      website VARCHAR(255) DEFAULT '',
      social_links JSON,
      post_count INT DEFAULT 0,
      follower_count INT DEFAULT 0,
      following_count INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 关注关系表
  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_follows (
      follower_id INT NOT NULL,
      following_id INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (follower_id, following_id),
      INDEX idx_following (following_id),
      INDEX idx_follower (follower_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 拉黑关系表（单向，user_id 屏蔽了 blocked_user_id）
  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_blocks (
      user_id INT NOT NULL,
      blocked_user_id INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, blocked_user_id),
      INDEX idx_blocked (blocked_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── 通知系统 ─────────────────────────────────────────────────────────────────
  await forumDb.execute(`
    CREATE TABLE IF NOT EXISTS forum_notifications (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL COMMENT '通知接收者',
      type ENUM('like_post', 'like_comment', 'comment', 'follow', 'system') NOT NULL,
      actor_id INT NOT NULL COMMENT '触发动作的用户',
      target_type VARCHAR(50) DEFAULT NULL COMMENT '关联目标类型: post, comment',
      target_id BIGINT DEFAULT NULL COMMENT '关联目标ID',
      target_title VARCHAR(255) DEFAULT NULL COMMENT '关联目标标题(冗余存储,避免JOIN)',
      is_read TINYINT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notifications_user (user_id, is_read, created_at),
      INDEX idx_notifications_user_unread (user_id, is_read) USING BTREE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // P1-B 加固：同一接收者+事件类型+触发者+目标 只能有 1 条通知（点赞/评论不会出现两条一模一样的红点）
  const notifUniqueExists = await forumDb.queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'forum_notifications'
        AND INDEX_NAME = 'uk_forum_notifications_dedup'`
  );
  if (!notifUniqueExists || notifUniqueExists.c === 0) {
    // 老数据去重（保留最新 id），避免后续 ALTER UNIQUE 失败
    await forumDb.execute(`
      DELETE t FROM forum_notifications t
      LEFT JOIN (
        SELECT MAX(id) keep_id
          FROM forum_notifications
         GROUP BY user_id, type, actor_id,
                  LEFT(IFNULL(target_type,''), 50),
                  IFNULL(target_id, 0)
      ) k ON t.id = k.keep_id
      WHERE k.keep_id IS NULL
    `);
    await forumDb.execute(
      'ALTER TABLE forum_notifications ADD UNIQUE KEY uk_forum_notifications_dedup ' +
      '(user_id, type, actor_id, target_type(50), target_id)'
    );
  }

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
