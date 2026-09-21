import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import mysql2 from 'mysql2/promise';
import { detectBpmFromUrl } from '../services/bpmDetector.js';

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

const FORBIDDEN_DB_SUFFIXES = ['_prod', '_production', '_online', '_live', '_master'];
const env = (process.env.NODE_ENV || 'development').toLowerCase();

if (env === 'production') {
  console.error('[fill-missing-keys] NODE_ENV=production，禁止执行。');
  process.exit(1);
}
const dbName = process.env.DB_NAME || '';
if (dbName && (dbName === 'rap_beats' || FORBIDDEN_DB_SUFFIXES.some(s => dbName.includes(s)))) {
  console.error(`[fill-missing-keys] 检测到疑似生产库 "${dbName}"，拒绝执行。`);
  process.exit(1);
}

// 默认 user=root 仅为兼容旧脚本；显式设置 DB_USER 时优先使用
const dbUser = process.env.DB_USER || 'root';
const dbPassword = process.env.DB_PASSWORD || '';
if (!dbPassword) {
  console.error('[fill-missing-keys] DB_PASSWORD 未设置，无法连接数据库。');
  process.exit(1);
}
if (dbUser === 'root' && !process.env.DB_USER) {
  console.warn('[fill-missing-keys] 警告：使用默认 root 用户（非生产安全配置）。');
}

const pool = mysql2.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: dbUser,
  password: dbPassword,
  database: dbName || undefined,
  waitForConnections: true,
  connectionLimit: 1,
});

async function main() {
  const [rows] = await pool.query<mysql2.RowDataPacket[]>(
    'SELECT id, title, file_path FROM beats WHERE `key` = "" OR `key` IS NULL'
  );

  console.log(`Found ${rows.length} beats with empty key\n`);

  let updated = 0;
  let skipped = 0;

  for (const beat of rows) {
    try {
      console.log(`[${beat.id}] ${beat.title}`);
      console.log(`  URL: ${beat.file_path}`);

      const result = await detectBpmFromUrl(beat.file_path);
      if (!result) {
        console.log('  ❌ Detection failed, skipping\n');
        skipped++;
        continue;
      }

      const keyValue = result.key || 'Unknown';

      await pool.execute(
        'UPDATE beats SET `key` = ?, bpm = ? WHERE id = ?',
        [keyValue, result.bpm, beat.id]
      );

      console.log(`  ✓ key="${keyValue}", bpm=${result.bpm}\n`);
      updated++;
    } catch (err: any) {
      console.error(`  ❌ Error: ${err.message}\n`);
      skipped++;
    }
  }

  console.log(`Done: ${updated} updated, ${skipped} skipped`);
  await pool.end();
}

main().catch(console.error);
