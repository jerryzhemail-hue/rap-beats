/**
 * 同步 beats.producer 字段到 beat_producers 多对多关联表。
 *
 * 语义：频道按「制作人(producer)」组织（producer 为空才回退 rapper）。
 * 行为:
 *  - 解析每条 beat 的 producer 字段(用 & 分割,容忍 " & "/"&" 等变体)
 *  - 同人不同写法归一化（jonyJ->Jony J 等），避免重复频道
 *  - 每个名字确保在 rappers 表存在(不存在则 INSERT)
 *  - 为缺失的关联补建 beat_producers 行(幂等,不删任何已有行)
 *
 * 用法:
 *   cd server
 *   node --import tsx/esm scripts/sync-beat-producers.ts
 */
import { getDatabaseClient } from '../src/database/index.js';
import { normalizeArtistName } from '../src/utils/artistNames.js';

const db = getDatabaseClient();

function splitNames(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[&]/)) {
    const name = normalizeArtistName(part.trim());
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

async function ensureRapper(name: string): Promise<number> {
  const found = await db.queryOne<{ id: number }>('SELECT id FROM rappers WHERE name = ?', [name]);
  if (found) return found.id;
  const result = await db.execute('INSERT INTO rappers (name, sort_order) VALUES (?, 0)', [name]);
  return (result as any).insertId as number;
}

async function main() {
  console.log('--- sync-beat-producers (producer 字段) ---');
  const beats = await db.queryMany<{ id: number; title: string; producer: string | null; rapper: string | null }>(
    'SELECT id, title, producer, rapper FROM beats ORDER BY id'
  );
  console.log(`共 ${beats.length} 条 beat`);

  let inserted = 0;
  let skipped = 0;

  for (const beat of beats) {
    const source = beat.producer && beat.producer.trim() ? beat.producer : beat.rapper;
    const names = splitNames(source);
    for (const name of names) {
      const rapperId = await ensureRapper(name);
      const exists = await db.queryOne<{ c: number }>(
        'SELECT COUNT(*) AS c FROM beat_producers WHERE beat_id = ? AND rapper_id = ?',
        [beat.id, rapperId]
      );
      if (exists && exists.c > 0) {
        skipped++;
      } else {
        await db.execute(
          'INSERT INTO beat_producers (beat_id, rapper_id, rapper_name) VALUES (?, ?, ?)',
          [beat.id, rapperId, name]
        );
        inserted++;
      }
    }
  }

  console.log(`beat_producers 新增: ${inserted}, 已存在跳过: ${skipped}`);
  process.exit(0);
}

main().catch((e) => { console.error('同步失败:', e); process.exit(1); });
