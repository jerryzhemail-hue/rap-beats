/**
 * 重建 beats -> beat_producers 的「制作人」频道关联。
 *
 * 语义：频道按 beats.producer(制作人) 组织，而不是 rapper。
 *  - 每个 beat 按其 producer 字段(用 & 分隔合作者)建立关联
 *  - 同人不同写法统一到保留名，避免重复频道
 *  - 先清后建，保证幂等
 *
 * 运行: cd server && node --import tsx/esm src/scripts/rebuild-producer-links.ts
 */

import 'dotenv/config';
import mysql, { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

if (process.env.NODE_ENV === 'production') {
  console.error('❌ rebuild-producer-links 禁止在 NODE_ENV=production 环境下执行');
  process.exit(1);
}
if (process.env.DB_NAME === 'rap_beats') {
  console.error('❌ 检测到生产库名 rap_beats，拒绝执行');
  process.exit(1);
}

// 同一制作人的不同写法 -> 保留名（与 rappers 表已存在的主名对齐）
const NAME_ALIASES: Record<string, string> = {
  'MC热狗': '热狗 MC HotDog',
  'jonyJ': 'Jony J',
  'knownknow': 'knowknow',
  'repeter': 'repeter吴嘉轩',
};

function normalizeName(name: string): string {
  return NAME_ALIASES[name] || name;
}

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || '3307'),
  user: process.env.DB_USER || 'dev_user',
  password: process.env.DB_PASSWORD || 'dev_pass_2024',
  database: process.env.DB_NAME || 'rap_beats_dev',
};

async function main() {
  const conn = await mysql.createConnection(dbConfig);

  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT id, producer, rapper FROM beats ORDER BY id'
  );

  // 先清空整张关联表，再按 producer 全量重建
  await conn.execute('DELETE FROM beat_producers');

  let createdRappers = 0;
  let associations = 0;

  for (const row of rows) {
    const beatId = row.id as number;
    const producer = typeof row.producer === 'string' ? row.producer : '';
    const rapper = typeof row.rapper === 'string' ? row.rapper : '';

    // 频道名 = producer；若 producer 为空才回退到 rapper（历史数据兜底）
    const source = producer.trim() ? producer : rapper;

    const names = new Set<string>();
    for (const part of source.split('&')) {
      const name = normalizeName(part.trim());
      if (name) names.add(name);
    }

    for (const name of names) {
      const [existing] = await conn.query<RowDataPacket[]>(
        'SELECT id FROM rappers WHERE name = ?',
        [name]
      );

      let rapperId: number;
      if (existing[0]) {
        rapperId = existing[0].id as number;
      } else {
        const [inserted] = await conn.execute<ResultSetHeader>(
          'INSERT INTO rappers (name, avatar_url, bio, sort_order) VALUES (?, NULL, ?, 0)',
          [name, '由 producer 自动同步']
        );
        rapperId = inserted.insertId;
        createdRappers += 1;
        console.log(`  + 新建频道 "${name}" id=${rapperId}`);
      }

      await conn.execute(
        'INSERT INTO beat_producers (beat_id, rapper_id, rapper_name) VALUES (?, ?, ?)',
        [beatId, rapperId, name]
      );
      associations += 1;
    }
  }

  console.log('=== rebuild-producer-links 完成 ===');
  console.log(`beats 总数: ${rows.length}`);
  console.log(`新增频道: ${createdRappers}`);
  console.log(`写入 beat_producers 关联: ${associations}`);

  await conn.end();
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
