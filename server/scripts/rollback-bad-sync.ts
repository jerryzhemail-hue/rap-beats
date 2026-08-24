/**
 * 回滚 sync-beat-producers.ts 上一版本(同时处理 producer + rapper)产生的误操作。
 *
 * 上一版脚本错误地把 producer 字段("MC热狗"、"jonyJ"等)当成 rapper 处理,
 * 创建了 4 个重复 rapper (id 120-123) 和 5 个无意义的关联行 (id 164-168)。
 *
 * 回滚策略(按 ID 直接删除,精确,不动其他行):
 *  Step 1: 删除 beat_producers id IN (164, 165, 166, 167, 168)
 *  Step 2: 删除 rappers id IN (120, 121, 122, 123)
 *
 * 验证条件(执行前 dry-run 检查,只有匹配才执行):
 *  - rapper id IN (120..123) 的 bio 必须 IS NULL 且 sort_order=0
 *  - beat_producers id IN (164..168) 的 created_at 必须晚于 2026-08-23 10:30
 *
 * 用法:
 *   cd server
 *   env $(grep -v '^#' .env | grep -E '^DB_|^MYSQL_' | xargs) \
 *     node --import tsx/esm scripts/rollback-bad-sync.ts
 */
import { getDatabaseClient } from '../src/database/index.js';

const db = getDatabaseClient();

const BAD_RAPPER_IDS = [120, 121, 122, 123];
const BAD_BP_IDS = [164, 165, 166, 167, 168];

async function main() {
  console.log('--- 回滚上一次错误同步 ---');

  // 验证 1: 检查要删除的 rapper 是否真的是垃圾数据
  const badRappers = await db.queryMany<{ id: number; name: string; bio: string | null; sort_order: number }>(
    `SELECT id, name, bio, sort_order FROM rappers WHERE id IN (?, ?, ?, ?)`,
    BAD_RAPPER_IDS
  );
  console.log('--- 待删除 rapper ---');
  console.table(badRappers);

  const validRappers = badRappers.filter((r) => r.bio === null && r.sort_order === 0);
  if (validRappers.length !== BAD_RAPPER_IDS.length) {
    console.error('❌ 验证失败:不是所有目标 rapper 都是"空 bio + sort_order=0"的新建行,拒绝执行');
    console.error('请人工检查数据库后再执行');
    process.exit(2);
  }

  // 验证 2: 检查要删除的 beat_producers 行
  const badBps = await db.queryMany<{ id: number; beat_id: number; rapper_id: number; rapper_name: string | null; created_at: Date }>(
    `SELECT id, beat_id, rapper_id, rapper_name, created_at FROM beat_producers WHERE id IN (?, ?, ?, ?, ?)`,
    BAD_BP_IDS
  );
  console.log('--- 待删除 beat_producers 行 ---');
  console.table(badBps);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const validBps = badBps.filter((r) => new Date(r.created_at) > oneHourAgo);
  if (validBps.length !== BAD_BP_IDS.length) {
    console.error('❌ 验证失败:不是所有目标 beat_producers 行都是 1 小时内创建的,拒绝执行');
    console.error('请人工检查数据库后再执行');
    process.exit(2);
  }

  console.log('\n所有验证通过,执行删除 ...\n');

  // Step 1: 删 beat_producers(必须先删,否则 FK 报错)
  const r1 = await db.execute(
    `DELETE FROM beat_producers WHERE id IN (${BAD_BP_IDS.map(() => '?').join(',')})`,
    BAD_BP_IDS
  );
  console.log(`已删除 beat_producers: ${(r1 as any).affectedRows} 行`);

  // Step 2: 删 rappers
  const r2 = await db.execute(
    `DELETE FROM rappers WHERE id IN (${BAD_RAPPER_IDS.map(() => '?').join(',')})`,
    BAD_RAPPER_IDS
  );
  console.log(`已删除 rappers: ${(r2 as any).affectedRows} 行`);

  // 验证 3: 确认删干净了
  console.log('\n--- 验证回滚结果 ---');
  const stillRappers = await db.queryMany<{ c: number }>(
    `SELECT COUNT(*) AS c FROM rappers WHERE id IN (${BAD_RAPPER_IDS.map(() => '?').join(',')})`,
    BAD_RAPPER_IDS
  );
  console.log(`rapper id IN 120..123 的剩余行数: ${stillRappers[0]?.c ?? 0}`);

  const stillBps = await db.queryMany<{ c: number }>(
    `SELECT COUNT(*) AS c FROM beat_producers WHERE id IN (${BAD_BP_IDS.map(() => '?').join(',')})`,
    BAD_BP_IDS
  );
  console.log(`beat_producers id IN 164..168 的剩余行数: ${stillBps[0]?.c ?? 0}`);

  const newTotal = await db.queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM beat_producers');
  console.log(`当前 beat_producers 总行数: ${newTotal?.c}`);

  console.log('\n✅ 回滚完成');
  process.exit(0);
}

main().catch((e) => {
  console.error('回滚失败:', e);
  process.exit(1);
});
