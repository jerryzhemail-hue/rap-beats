import fs from 'fs';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import mysql2 from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envCandidates = [
  path.join(process.cwd(), '.env'),
  path.join(__dirname, '../../.env')
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

type MySqlConnection = mysql2.Connection;

type SqliteUser = {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: string;
  is_vip?: number | null;
  vip_expire_at?: string | null;
  vip_level?: string | null;
  avatar_url?: string | null;
};

type SqliteBeat = {
  id: number;
  title: string;
  producer: string;
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
  uploaded_by?: number | null;
  is_vip_only?: number | null;
};

type SqliteFavorite = { id: number; user_id: number; beat_id: number; created_at: string };
type SqliteComment = { id: number; user_id: number; beat_id: number; content: string; created_at: string };
type SqliteDownload = { id: number; user_id: number; beat_id: number; created_at: string };
type SqliteOrder = {
  id: number;
  user_id: number;
  vip_level: string;
  amount: number;
  stripe_session_id: string | null;
  status: string;
  created_at: string;
};

function toMySqlDateTime(value: string | null | undefined): string | null {
  if (!value) return null;

  const normalized = value.trim();
  if (!normalized) return null;

  const date = new Date(normalized);
  if (!Number.isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  return normalized.replace('T', ' ').replace('Z', '');
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function isProductionLikeEnv(): boolean {
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
  return nodeEnv === 'production';
}

function assertDangerousFlagsAllowed(options: {
  dryRun: boolean;
  truncate: boolean;
  force: boolean;
}) {
  if (!options.truncate && !options.force) return;
  if (options.dryRun) return;

  const confirmation = readArg('--confirm');
  const expected = 'I_UNDERSTAND_THE_RISK';
  if (confirmation !== expected) {
    throw new Error(
      `危险操作已阻止：使用 --force 或 --truncate 时，必须追加 --confirm ${expected}`
    );
  }

  if (isProductionLikeEnv() && process.env.ALLOW_DESTRUCTIVE_MIGRATION !== 'yes') {
    throw new Error(
      '危险操作已阻止：生产环境默认禁用 --force / --truncate。如确需执行，请显式设置 ALLOW_DESTRUCTIVE_MIGRATION=yes'
    );
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function ensureMySqlSchema(mysql: MySqlConnection) {
  await mysql.query(`
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

  await mysql.query(`
    CREATE TABLE IF NOT EXISTS beats (
      id INT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      producer VARCHAR(255) NOT NULL,
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
      CONSTRAINT fk_beats_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await mysql.query(`
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

  await mysql.query(`
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

  await mysql.query(`
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

  await mysql.query(`
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
}

async function queryCount(mysql: MySqlConnection, table: string): Promise<number> {
  const [rows] = await mysql.query(`SELECT COUNT(*) as count FROM \`${table}\``);
  const row = (rows as { count: number }[])[0];
  return row?.count ?? 0;
}

async function setAutoIncrement(mysql: MySqlConnection, table: string) {
  const [rows] = await mysql.query(`SELECT MAX(id) as maxId FROM \`${table}\``);
  const row = (rows as { maxId: number | null }[])[0];
  const maxId = row?.maxId ?? 0;
  await mysql.query(`ALTER TABLE \`${table}\` AUTO_INCREMENT = ?`, [maxId + 1]);
}

async function assertDestinationEmpty(mysql: MySqlConnection, tables: string[]) {
  const notEmpty: { table: string; count: number }[] = [];
  for (const table of tables) {
    const count = await queryCount(mysql, table);
    if (count > 0) notEmpty.push({ table, count });
  }
  if (notEmpty.length > 0) {
    throw new Error(`目标 MySQL 数据库非空：${JSON.stringify(notEmpty)}`);
  }
}

async function truncateDestination(mysql: MySqlConnection) {
  await mysql.query('SET FOREIGN_KEY_CHECKS=0');
  await mysql.query('TRUNCATE TABLE `favorites`');
  await mysql.query('TRUNCATE TABLE `comments`');
  await mysql.query('TRUNCATE TABLE `downloads`');
  await mysql.query('TRUNCATE TABLE `orders`');
  await mysql.query('TRUNCATE TABLE `beats`');
  await mysql.query('TRUNCATE TABLE `users`');
  await mysql.query('SET FOREIGN_KEY_CHECKS=1');
}

async function migrateUsers(sqlite: Database.Database, mysql: MySqlConnection, batchSize: number) {
  const rows = sqlite.prepare(
    'SELECT id, username, email, password_hash, role, created_at, is_vip, vip_expire_at, vip_level, avatar_url FROM users ORDER BY id ASC'
  ).all() as SqliteUser[];

  const chunks = chunkArray(rows, batchSize);
  for (const chunk of chunks) {
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const params: unknown[] = [];
    for (const row of chunk) {
      params.push(
        row.id,
        row.username,
        row.email,
        row.password_hash,
        row.role || 'user',
        toMySqlDateTime(row.created_at),
        row.is_vip ?? 0,
        toMySqlDateTime(row.vip_expire_at),
        row.vip_level ?? 'free',
        row.avatar_url ?? null
      );
    }
    await mysql.query(
      `INSERT INTO users (id, username, email, password_hash, role, created_at, is_vip, vip_expire_at, vip_level, avatar_url) VALUES ${placeholders}`,
      params as any[]
    );
  }

  await setAutoIncrement(mysql, 'users');
  return rows.length;
}

async function migrateBeats(sqlite: Database.Database, mysql: MySqlConnection, batchSize: number) {
  const rows = sqlite.prepare(
    'SELECT id, title, producer, bpm, key, genre, tags, duration, file_path, cover_image, download_count, is_free, created_at, uploaded_by, is_vip_only FROM beats ORDER BY id ASC'
  ).all() as SqliteBeat[];

  const chunks = chunkArray(rows, batchSize);
  for (const chunk of chunks) {
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const params: unknown[] = [];
    for (const row of chunk) {
      params.push(
        row.id,
        row.title,
        row.producer,
        row.bpm,
        row.key,
        row.genre,
        row.tags ?? null,
        row.duration,
        row.file_path,
        row.cover_image ?? null,
        row.download_count ?? 0,
        row.is_free ?? 0,
        toMySqlDateTime(row.created_at),
        row.uploaded_by ?? null,
        row.is_vip_only ?? 0
      );
    }
    await mysql.query(
      `INSERT INTO beats (id, title, producer, bpm, \`key\`, genre, tags, duration, file_path, cover_image, download_count, is_free, created_at, uploaded_by, is_vip_only) VALUES ${placeholders}`,
      params as any[]
    );
  }

  await setAutoIncrement(mysql, 'beats');
  return rows.length;
}

async function migrateFavorites(sqlite: Database.Database, mysql: MySqlConnection, batchSize: number) {
  const rows = sqlite.prepare('SELECT id, user_id, beat_id, created_at FROM favorites ORDER BY id ASC').all() as SqliteFavorite[];
  const chunks = chunkArray(rows, batchSize);
  for (const chunk of chunks) {
    const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
    const params: unknown[] = [];
    for (const row of chunk) params.push(row.id, row.user_id, row.beat_id, toMySqlDateTime(row.created_at));
    await mysql.query(`INSERT INTO favorites (id, user_id, beat_id, created_at) VALUES ${placeholders}`, params as any[]);
  }
  await setAutoIncrement(mysql, 'favorites');
  return rows.length;
}

async function migrateComments(sqlite: Database.Database, mysql: MySqlConnection, batchSize: number) {
  const rows = sqlite.prepare('SELECT id, user_id, beat_id, content, created_at FROM comments ORDER BY id ASC').all() as SqliteComment[];
  const chunks = chunkArray(rows, batchSize);
  for (const chunk of chunks) {
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const params: unknown[] = [];
    for (const row of chunk) params.push(row.id, row.user_id, row.beat_id, row.content, toMySqlDateTime(row.created_at));
    await mysql.query(`INSERT INTO comments (id, user_id, beat_id, content, created_at) VALUES ${placeholders}`, params as any[]);
  }
  await setAutoIncrement(mysql, 'comments');
  return rows.length;
}

async function migrateDownloads(sqlite: Database.Database, mysql: MySqlConnection, batchSize: number) {
  const rows = sqlite.prepare('SELECT id, user_id, beat_id, created_at FROM downloads ORDER BY id ASC').all() as SqliteDownload[];
  const chunks = chunkArray(rows, batchSize);
  for (const chunk of chunks) {
    const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
    const params: unknown[] = [];
    for (const row of chunk) params.push(row.id, row.user_id, row.beat_id, toMySqlDateTime(row.created_at));
    await mysql.query(`INSERT INTO downloads (id, user_id, beat_id, created_at) VALUES ${placeholders}`, params as any[]);
  }
  await setAutoIncrement(mysql, 'downloads');
  return rows.length;
}

async function migrateOrders(sqlite: Database.Database, mysql: MySqlConnection, batchSize: number) {
  const rows = sqlite.prepare(
    'SELECT id, user_id, vip_level, amount, stripe_session_id, status, created_at FROM orders ORDER BY id ASC'
  ).all() as SqliteOrder[];

  const chunks = chunkArray(rows, batchSize);
  for (const chunk of chunks) {
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
    const params: unknown[] = [];
    for (const row of chunk) {
      params.push(
        row.id,
        row.user_id,
        row.vip_level,
        row.amount,
        row.stripe_session_id ?? null,
        row.status,
        toMySqlDateTime(row.created_at)
      );
    }
    await mysql.query(`INSERT INTO orders (id, user_id, vip_level, amount, stripe_session_id, status, created_at) VALUES ${placeholders}`, params as any[]);
  }

  await setAutoIncrement(mysql, 'orders');
  return rows.length;
}

async function main() {
  const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, '../../data/beats.db');

  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT || '3306');
  const user = process.env.DB_USER || '';
  const password = process.env.DB_PASSWORD || '';
  const databaseName = process.env.DB_NAME || '';

  if (!user || !databaseName) {
    throw new Error('缺少 MySQL 配置：DB_USER / DB_NAME 必填');
  }

  const batchSize = Number(readArg('--batch') || '200');
  const dryRun = hasFlag('--dry-run');
  const truncate = hasFlag('--truncate');
  const force = hasFlag('--force');

  assertDangerousFlagsAllowed({ dryRun, truncate, force });

  const sqlite = new Database(sqlitePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const mysql = await mysql2.createConnection({
    host,
    port,
    user,
    password,
    database: databaseName,
    multipleStatements: true
  });

  await ensureMySqlSchema(mysql);

  const tables = ['users', 'beats', 'favorites', 'comments', 'downloads', 'orders'];
  if (!force && !truncate) {
    await assertDestinationEmpty(mysql, tables);
  }

  if (truncate) {
    if (!dryRun) await truncateDestination(mysql);
  }

  if (dryRun) {
    const sqliteCounts = {
      users: (sqlite.prepare('SELECT COUNT(*) as count FROM users').get() as any).count as number,
      beats: (sqlite.prepare('SELECT COUNT(*) as count FROM beats').get() as any).count as number,
      favorites: (sqlite.prepare('SELECT COUNT(*) as count FROM favorites').get() as any).count as number,
      comments: (sqlite.prepare('SELECT COUNT(*) as count FROM comments').get() as any).count as number,
      downloads: (sqlite.prepare('SELECT COUNT(*) as count FROM downloads').get() as any).count as number,
      orders: (sqlite.prepare('SELECT COUNT(*) as count FROM orders').get() as any).count as number
    };
    const mysqlCounts: Record<string, number> = {};
    for (const t of tables) mysqlCounts[t] = await queryCount(mysql, t);
    console.log(JSON.stringify({ mode: 'dry-run', sqlitePath, sqliteCounts, mysqlCounts }, null, 2));
    await mysql.end();
    return;
  }

  await mysql.query('SET FOREIGN_KEY_CHECKS=0');
  await mysql.beginTransaction();
  try {
    const inserted = {
      users: await migrateUsers(sqlite, mysql, batchSize),
      beats: await migrateBeats(sqlite, mysql, batchSize),
      favorites: await migrateFavorites(sqlite, mysql, batchSize),
      comments: await migrateComments(sqlite, mysql, batchSize),
      downloads: await migrateDownloads(sqlite, mysql, batchSize),
      orders: await migrateOrders(sqlite, mysql, batchSize)
    };
    await mysql.commit();
    await mysql.query('SET FOREIGN_KEY_CHECKS=1');

    const mysqlCounts: Record<string, number> = {};
    for (const t of tables) mysqlCounts[t] = await queryCount(mysql, t);
    console.log(JSON.stringify({ ok: true, sqlitePath, inserted, mysqlCounts }, null, 2));
  } catch (error) {
    try {
      await mysql.rollback();
    } catch {}
    try {
      await mysql.query('SET FOREIGN_KEY_CHECKS=1');
    } catch {}
    throw error;
  } finally {
    try {
      await mysql.end();
    } catch {}
    try {
      sqlite.close();
    } catch {}
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
