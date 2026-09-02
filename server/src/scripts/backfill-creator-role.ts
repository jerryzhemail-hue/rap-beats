/**
 * 回填 beats.creator_role 字段
 *
 * 背景：beats.creator_role 字段默认值为 'admin'，但历史上 beatmaker 通过
 * `/api/beats/upload` 或 `/api/beats/upload-direct` 上传的作品也会被错误归类
 * 为 'admin'。本次统一行为后，需要修正历史数据，使：
 *   - 管理员上传的作品 -> creator_role = 'admin'
 *   - Beatmaker 上传的作品 -> creator_role = 'beatmaker'
 *
 * 执行：cd server && node --import tsx/esm src/scripts/backfill-creator-role.ts
 */
import { getDatabaseClient } from '../database/index.js';

interface BeatRow {
  id: number;
  uploaded_by: number | null;
  creator_role: 'admin' | 'beatmaker' | 'rappers_only';
}

interface UserRow {
  id: number;
  role: string;
  is_beatmaker: number;
}

async function main() {
  const db = await getDatabaseClient();

  console.log('=== 开始回填 beats.creator_role ===\n');

  try {
    // 1. 找出所有 beats 记录
    const beats = await db.queryMany<BeatRow>(
      'SELECT id, uploaded_by, creator_role FROM beats ORDER BY id ASC'
    );
    console.log(`总 beats 数量: ${beats.length}`);

    // 收集所有 uploaded_by 用户 ID（去重）
    const uploaderIds = Array.from(
      new Set(beats.map((b) => b.uploaded_by).filter((id): id is number => id !== null))
    );

    // 2. 批量查询上传者身份
    let userMap = new Map<number, UserRow>();
    if (uploaderIds.length > 0) {
      const placeholders = uploaderIds.map(() => '?').join(',');
      const users = await db.queryMany<UserRow>(
        `SELECT id, role, is_beatmaker FROM users WHERE id IN (${placeholders})`,
        uploaderIds
      );
      userMap = new Map(users.map((u) => [u.id, u]));
    }

    // 3. 计算需要更新的记录
    const updates: Array<{ id: number; oldRole: string; newRole: 'admin' | 'beatmaker'; userId: number | null }> = [];
    for (const beat of beats) {
      let newRole: 'admin' | 'beatmaker';
      if (beat.uploaded_by === null) {
        // 旧数据，没有上传者：保守起见保持 'admin'（与字段默认值一致）
        newRole = 'admin';
      } else {
        const user = userMap.get(beat.uploaded_by);
        if (!user) {
          // 上传者账号已被删除，保持原状
          continue;
        }
        if (user.role === 'admin') {
          newRole = 'admin';
        } else if (user.is_beatmaker === 1) {
          newRole = 'beatmaker';
        } else {
          // 既不是 admin 也不是 beatmaker（理论上不会，因为 requireUploader 已拦截）
          // 保持 'admin' 默认值
          newRole = 'admin';
        }
      }
      if (newRole !== beat.creator_role) {
        updates.push({
          id: beat.id,
          oldRole: beat.creator_role,
          newRole,
          userId: beat.uploaded_by,
        });
      }
    }

    console.log(`需要更新的记录数: ${updates.length}\n`);

    if (updates.length === 0) {
      console.log('✅ 无需更新，退出。');
      return;
    }

    // 4. 打印预览（前 10 条）
    console.log('【更新预览 - 前 10 条】');
    updates.slice(0, 10).forEach((u) => {
      console.log(`  beat #${u.id}: ${u.oldRole} -> ${u.newRole} (uploaded_by=${u.userId})`);
    });
    if (updates.length > 10) {
      console.log(`  ... 还有 ${updates.length - 10} 条`);
    }
    console.log('');

    // 5. 执行更新（逐条更新，便于排错）
    console.log('【执行更新】');
    await db.execute('START TRANSACTION');
    let successCount = 0;
    let failCount = 0;
    for (const u of updates) {
      try {
        await db.execute('UPDATE beats SET creator_role = ? WHERE id = ?', [u.newRole, u.id]);
        successCount += 1;
      } catch (err) {
        failCount += 1;
        console.error(`  ❌ beat #${u.id} 更新失败:`, err);
      }
    }

    if (failCount > 0) {
      console.error(`\n⚠️ 有 ${failCount} 条更新失败，执行回滚`);
      await db.execute('ROLLBACK');
      process.exit(1);
    }

    await db.execute('COMMIT');
    console.log(`\n✅ 回填完成！成功 ${successCount} 条`);

    // 6. 输出最终统计
    const finalStats = await db.queryMany<{ creator_role: string; count: number }>(
      'SELECT creator_role, COUNT(*) AS count FROM beats GROUP BY creator_role'
    );
    console.log('\n【回填后分布】');
    finalStats.forEach((row) => {
      console.log(`  ${row.creator_role}: ${row.count}`);
    });
  } catch (error) {
    console.error('\n❌ 回填失败:', error);
    try {
      await db.execute('ROLLBACK');
    } catch {
      // ignore
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
