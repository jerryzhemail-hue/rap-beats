/**
 * 清理本地文件缺失的 beats 测试数据
 *
 * 安全设计：
 * 1. fail-fast：仅在 development / test 环境执行，DB_NAME 必须是 rap_beats（不含 _prod / _dev）
 * 2. dry-run 模式：默认不写库，只打印统计；设置 DRY_RUN=false 确认要执行
 * 3. ID 范围从环境变量注入：CLEANUP_BEATS_MIN_ID / CLEANUP_BEATS_MAX_ID（禁止硬编码）
 * 4. 事务保护：ROLLBACK 兜底
 *
 * 执行示例：
 *   # 仅预览（默认）
 *   cd server && node --import tsx/esm src/scripts/cleanup-missing-beats.ts
 *
 *   # 预览（显式 dry-run）
 *   DRY_RUN=true node --import tsx/esm src/scripts/cleanup-missing-beats.ts
 *
 *   # 执行清理（仅本地开发）
 *   NODE_ENV=development DB_NAME=rap_beats DRY_RUN=false \
 *     CLEANUP_BEATS_MIN_ID=81 CLEANUP_BEATS_MAX_ID=109 \
 *     node --import tsx/esm src/scripts/cleanup-missing-beats.ts
 */

import { getDatabaseClient } from '../database/index.js';

// ─── Fail-fast ───────────────────────────────────────────────────────────────

const env = (process.env.NODE_ENV || 'development').toLowerCase();
if (env !== 'development' && env !== 'test') {
  console.error(
    `[cleanup-missing-beats] NODE_ENV=${process.env.NODE_ENV}，此脚本仅限 development/test 环境执行。\n` +
    '如需在生产环境执行，请联系 DBA 确认。'
  );
  process.exit(1);
}

const dbName = process.env.DB_NAME || '';
if (!dbName) {
  console.error('[cleanup-missing-beats] DB_NAME 未设置，无法确认目标库。');
  process.exit(1);
}
if (dbName.includes('_prod') || dbName.includes('_production')) {
  console.error(`[cleanup-missing-beats] DB_NAME=${dbName}，禁止操作生产库！`);
  process.exit(1);
}
if (dbName.includes('_dev') || dbName.includes('_local')) {
  console.warn(`[cleanup-missing-beats] DB_NAME=${dbName}，看起来是本地开发库，将继续。`);
}

// ─── 配置 ────────────────────────────────────────────────────────────────────

const MIN_ID = parseInt(process.env.CLEANUP_BEATS_MIN_ID || '', 10);
const MAX_ID = parseInt(process.env.CLEANUP_BEATS_MAX_ID || '', 10);

if (!Number.isFinite(MIN_ID) || !Number.isFinite(MAX_ID)) {
  console.error(
    `[cleanup-missing-beats] 必须设置 CLEANUP_BEATS_MIN_ID 和 CLEANUP_BEATS_MAX_ID 环境变量（整数）。\n` +
    `当前: MIN_ID=${process.env.CLEANUP_BEATS_MIN_ID} MAX_ID=${process.env.CLEANUP_BEATS_MAX_ID}`
  );
  process.exit(1);
}
if (MIN_ID > MAX_ID) {
  console.error(`[cleanup-missing-beats] CLEANUP_BEATS_MIN_ID(${MIN_ID}) > CLEANUP_BEATS_MAX_ID(${MAX_ID})`);
  process.exit(1);
}

const DRY_RUN = process.env.DRY_RUN !== 'false'; // 默认 dry-run（安全默认值）

// ─── 核心逻辑 ───────────────────────────────────────────────────────────────

async function main() {
  const db = await getDatabaseClient();

  const whereClause = `id BETWEEN ${MIN_ID} AND ${MAX_ID}`;
  const idRange = `${MIN_ID}-${MAX_ID}`;

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     cleanup-missing-beats  安全执行脚本      ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\n[环境]   NODE_ENV=${env}  DB_NAME=${dbName}`);
  console.log(`[范围]   beats ${whereClause}`);
  console.log(`[模式]   ${DRY_RUN ? '🔍 DRY-RUN（只读，不写库）' : '⚠️  LIVE（将执行 DELETE）'}`);

  if (DRY_RUN) {
    console.log('\n💡 如需实际执行，请设置 DRY_RUN=false\n');
  } else {
    console.log('\n🛑 警告：即将执行 DELETE，不可回滚！\n');
  }

  try {
    // 统计
    console.log('\n【待清理统计】');
    const [beforeStats] = await db.queryMany<{ total: number }>(
      'SELECT COUNT(*) as total FROM beats'
    );
    console.log(`  总 beats: ${beforeStats.total}`);

    const [targetStats] = await db.queryMany<{ count: number }>(
      `SELECT COUNT(*) as count FROM beats WHERE ${whereClause}`
    );
    console.log(`  目标 beats (ID ${idRange}): ${targetStats.count}`);

    const [licenseStats] = await db.queryMany<{ count: number }>(
      `SELECT COUNT(*) as count FROM beat_license_agreements WHERE beat_id ${whereClause}`
    );
    console.log(`  关联 license_agreements: ${licenseStats.count}`);

    if (targetStats.count === 0) {
      console.log('\n✅ 没有需要清理的 beats，退出。');
      return;
    }

    if (DRY_RUN) {
      console.log('\n🔍 DRY-RUN: 以下操作将被执行（实际未执行）：');
      console.log(`  DELETE FROM beat_license_agreements WHERE beat_id ${whereClause}`);
      console.log(`  DELETE FROM beats WHERE ${whereClause}`);
      console.log('\n✅ DRY-RUN 完成，未修改任何数据。');
      return;
    }

    // ── 确认提示（生产路径）─────────────────────────────────────────────
    console.log('\n请确认是否继续？输入 "YES" 继续，其他任意键取消：');
    const answer = await new Promise<string>((resolve) => {
      process.stdin.once('data', (chunk) => resolve(chunk.toString().trim()));
    });
    if (answer !== 'YES') {
      console.log('❌ 已取消，未执行任何操作。');
      return;
    }

    // ── 执行清理 ───────────────────────────────────────────────────────
    console.log('\n【开始事务】');
    await db.execute('START TRANSACTION');

    console.log('  删除 beat_license_agreements...');
    await db.execute(`DELETE FROM beat_license_agreements WHERE beat_id ${whereClause}`);

    console.log('  删除 beats (FK 级联生效)...');
    await db.execute(`DELETE FROM beats WHERE ${whereClause}`);

    // 验证
    console.log('\n【删除后验证】');
    const [afterStats] = await db.queryMany<{ total: number }>(
      'SELECT COUNT(*) as total FROM beats'
    );
    console.log(`  剩余 beats: ${afterStats.total}`);

    const [remainingLicense] = await db.queryMany<{ count: number }>(
      `SELECT COUNT(*) as count FROM beat_license_agreements WHERE beat_id ${whereClause}`
    );
    console.log(`  残留 license_agreements: ${remainingLicense.count}`);

    // 剩余分类
    console.log('\n【剩余 beats 分类】');
    const typeStats = await db.queryMany<{ type: string; count: number }>(
      `SELECT
        (CASE
          WHEN file_path REGEXP '^https?://' THEN 'REMOTE_URL'
          WHEN file_path IS NULL OR file_path = '' THEN 'EMPTY'
          ELSE 'LOCAL_OR_MISSING'
        END) AS type,
        COUNT(*) AS count
      FROM beats GROUP BY type`
    );
    typeStats.forEach(row => console.log(`  ${row.type}: ${row.count}`));

    console.log('\n【提交事务】');
    await db.execute('COMMIT');

    console.log('\n✅ 删除完成！');
    console.log(`   已删除: ${targetStats.count} beats + ${licenseStats.count} license_agreements`);
    console.log(`   剩余: ${afterStats.total} beats`);
  } catch (error) {
    console.error('\n❌ 操作失败，正在回滚...');
    try { await db.execute('ROLLBACK'); } catch {}
    console.error('错误详情:', error);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
