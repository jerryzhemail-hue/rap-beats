/**
 * 清理本地文件缺失的 beats 测试数据
 * 
 * 执行：cd server && node --import tsx/esm src/scripts/cleanup-missing-beats.ts
 */
import { getDatabaseClient } from '../database/index.js';

async function main() {
  const db = await getDatabaseClient();
  
  console.log('=== 开始清理 MISSING_LOCAL beats ===\n');
  
  try {
    // 1. 删除前统计
    console.log('【删除前统计】');
    const [beforeStats] = await db.queryMany<{ total: number }>(
      'SELECT COUNT(*) as total FROM beats'
    );
    console.log(`  总 beats: ${beforeStats.total}`);
    
    const [targetStats] = await db.queryMany<{ count: number }>(
      'SELECT COUNT(*) as count FROM beats WHERE id BETWEEN 81 AND 109'
    );
    console.log(`  待删除 beats (ID 81-109): ${targetStats.count}`);
    
    const [licenseStats] = await db.queryMany<{ count: number }>(
      'SELECT COUNT(*) as count FROM beat_license_agreements WHERE beat_id BETWEEN 81 AND 109'
    );
    console.log(`  关联 license_agreements: ${licenseStats.count}\n`);
    
    // 2. 开始事务
    console.log('【开始事务】');
    await db.execute('START TRANSACTION');
    
    // 3. 删除 beat_license_agreements（无 FK CASCADE）
    console.log('  删除 beat_license_agreements...');
    await db.execute('DELETE FROM beat_license_agreements WHERE beat_id BETWEEN 81 AND 109');
    
    // 4. 删除 beats（FK CASCADE 自动删其他表）
    console.log('  删除 beats (FK 级联生效)...');
    await db.execute('DELETE FROM beats WHERE id BETWEEN 81 AND 109');
    
    // 5. 验证
    console.log('\n【删除后验证】');
    const [afterStats] = await db.queryMany<{ total: number }>(
      'SELECT COUNT(*) as total FROM beats'
    );
    console.log(`  剩余 beats: ${afterStats.total}`);
    
    const [remainingLicense] = await db.queryMany<{ count: number }>(
      'SELECT COUNT(*) as count FROM beat_license_agreements WHERE beat_id BETWEEN 81 AND 109'
    );
    console.log(`  残留 license_agreements: ${remainingLicense.count}`);
    
    const [remainingPlay] = await db.queryMany<{ count: number }>(
      'SELECT COUNT(*) as count FROM play_events WHERE beat_id BETWEEN 81 AND 109'
    );
    console.log(`  残留 play_events: ${remainingPlay.count}`);
    
    // 6. 剩余分类
    console.log('\n【剩余 beats 分类】');
    const typeStats = await db.queryMany<{ type: string; count: number }>(
      `SELECT 
        (CASE 
          WHEN file_path REGEXP '^https?://' THEN 'REMOTE_URL'
          WHEN file_path IS NULL OR file_path = '' THEN 'EMPTY'
          ELSE 'LOCAL_OR_MISSING'
        END) AS type,
        COUNT(*) AS count
      FROM beats
      GROUP BY type`
    );
    typeStats.forEach(row => {
      console.log(`  ${row.type}: ${row.count}`);
    });
    
    // 7. 提交事务
    console.log('\n【提交事务】');
    await db.execute('COMMIT');
    
    console.log('\n✅ 删除完成！');
    console.log(`   已删除: ${targetStats.count} beats + ${licenseStats.count} license_agreements`);
    console.log(`   剩余: ${afterStats.total} beats`);
    
  } catch (error) {
    console.error('\n❌ 删除失败，正在回滚...');
    await db.execute('ROLLBACK');
    console.error('错误详情:', error);
    process.exit(1);
  }
}

main().catch(console.error);
