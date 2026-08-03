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

const pool = mysql2.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'rap_beats',
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
