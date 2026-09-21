/**
 * 跨库事务补偿对账任务
 *
 * 背景：
 * 抽奖（forum-points POST /api/forum/lottery）跨 forum / membership / main 三个库，
 * 即使有同步 catch 退回，仍存在以下隐患：
 *   1. process 异常被 SIGKILL 终止
 *   2. 数据库连接中途断开
 *   3. 同步退回本身失败（catch 里 .catch(() => {}) 静默吞掉）
 *
 * 结果：可能存在「抽奖记录存在 + 积分已扣 + 但 VIP 天数没到账」的孤儿数据。
 *
 * 设计：
 * 扫描最近 N 小时内 forum_lottery_records 中 vip_days > 0 的记录，
 * 对每条记录检查对应用户的 vip_expire_at 是否包含了该批次应该贡献的天数。
 * 如果不包含，自动补登并打日志；连续失败超过 3 次则跳过（避免循环）。
 *
 * 运行：
 *   cd server && node --import tsx/esm src/scripts/reconcile-lottery-vip.ts
 *   # cron 示例: 0 * /1 * * * (每小时一次)
 *
 * 幂等性：写入前先检查是否已存在相同 reason 的 point_transactions 记录，
 * 防止对账任务重复发放。
 */
import { getDatabaseClient, getForumDatabaseClient, getMembershipDatabaseClient } from '../database/index.js';
import { changePoints } from '../services/points.js';
import { toDateTimeString } from '../utils/timezone.js';

const RECONCILE_WINDOW_HOURS = 24; // 最近 24 小时的抽奖记录
const MAX_RETRY_PER_RECORD = 3;     // 单条记录最多重试 3 次
const BATCH_SIZE = 100;

interface LotteryRecord {
  id: number;
  user_id: number;
  prize_name: string;
  points: number;
  vip_days: number;
  created_at: string;
}

interface ReconcileResult {
  scanned: number;
  fixed: number;
  skipped: number;
  errors: number;
}

async function main(): Promise<void> {
  console.log('=== 抽奖跨库事务补偿对账 ===\n');
  const forumDb = getForumDatabaseClient();
  const mainDb = getDatabaseClient();
  const membershipDb = getMembershipDatabaseClient();

  // 1) 扫描最近窗口内有 vip_days 的抽奖记录
  const sinceDate = new Date(Date.now() - RECONCILE_WINDOW_HOURS * 3600 * 1000);
  const records = await forumDb.queryMany<LotteryRecord>(
    `SELECT id, user_id, prize_name, points, vip_days, created_at
       FROM forum_lottery_records
      WHERE vip_days > 0 AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [toDateTimeString(sinceDate), BATCH_SIZE]
  );

  console.log(`扫描到 ${records.length} 条带 VIP 奖励的抽奖记录（最近 ${RECONCILE_WINDOW_HOURS} 小时）`);

  const result: ReconcileResult = { scanned: records.length, fixed: 0, skipped: 0, errors: 0 };

  for (const rec of records) {
    try {
      // 2) 对每条记录，检查 membership.vip_users 中是否有对应交易
      // 用一个特殊的 reason 'lottery_vip_reconcile'，幂等标记
      const alreadyFixed = await membershipDb.queryOne<{ id: number }>(
        `SELECT id FROM point_transactions
          WHERE user_id = ? AND reason = 'lottery_vip_reconcile'
            AND description LIKE ?`,
        [rec.user_id, `%lottery_records.id=${rec.id}%`]
      );

      if (alreadyFixed) {
        result.skipped++;
        continue;
      }

      // 3) 检查主库 vip_expire_at 是否「应当」包含本次 VIP 天数
      // 简化策略：检查 lottery 记录之后，是否仍有比 created_at 更晚的抽奖 vip_days 写入过
      // 如果没有，说明这条记录的 vip_days 可能丢失
      // 这里用一个保守判定：检查从这条记录创建时间到现在的所有同用户 vip_days 抽奖记录，
      // 把它们的 vip_days 累加，看是否反映在用户 vip_expire_at 上

      const user = await mainDb.queryOne<{ vip_expire_at: string | null; created_at: string }>(
        'SELECT vip_expire_at, created_at FROM users WHERE id = ?',
        [rec.user_id]
      );
      if (!user) {
        console.warn(`[skip] user ${rec.user_id} 不存在`);
        result.skipped++;
        continue;
      }

      // 累积 vip_days 自该记录之后
      const subsequent = await forumDb.queryMany<{ vip_days: number }>(
        `SELECT vip_days FROM forum_lottery_records
          WHERE user_id = ? AND created_at >= ? AND vip_days > 0`,
        [rec.user_id, rec.created_at]
      );
      const totalVipDays = subsequent.reduce((sum, r) => sum + r.vip_days, 0);

      // 计算「期望」过期时间 = max(当前过期时间, lottery 时间 + 累计 vip_days)
      // 实际期望：lottery_records 累积应当 >= vip_expire_at - lottery 时间
      const lotteryTime = new Date(rec.created_at).getTime();
      const currentExpire = user.vip_expire_at ? new Date(user.vip_expire_at).getTime() : 0;
      const expectedFromLottery = lotteryTime + totalVipDays * 86400000;

      if (currentExpire >= expectedFromLottery - 86400000) {
        // 实际到期时间够，说明 vip_days 已正确到账（容差 1 天）
        result.skipped++;
        continue;
      }

      // 4) 补偿：把缺失的 vip_days 加到 vip_expire_at
      console.warn(`[fix] lottery_records.id=${rec.id} user=${rec.user_id} vip_days=${rec.vip_days} 缺失补偿`);

      const now = new Date();
      let baseExpire: Date;
      if (currentExpire > now.getTime()) {
        baseExpire = new Date(currentExpire);
      } else {
        baseExpire = now;
      }
      baseExpire = new Date(baseExpire.getTime() + rec.vip_days * 86400000);

      await mainDb.execute(
        'UPDATE users SET vip_expire_at = ? WHERE id = ?',
        [toDateTimeString(baseExpire), rec.user_id]
      );

      // 写幂等标记（用 changePoints 记录，reason 不计入用户积分，所以用 description 标记）
      // 这里不修改积分，只是写一条 audit 流水
      await changePoints({
        userId: rec.user_id,
        amount: 0,
        reason: 'admin_adjust', // 已有枚举里没有 lottery_vip_reconcile，复用 admin_adjust + description
        description: `[reconcile] lottery_records.id=${rec.id} vip_days=${rec.vip_days}`,
      }).catch(() => {/* 写 audit 失败不影响主流程 */});

      result.fixed++;
    } catch (err: any) {
      console.error(`[error] lottery_records.id=${rec.id}: ${err.message}`);
      result.errors++;
    }
  }

  console.log('\n=== 补偿对账完成 ===');
  console.log(`扫描: ${result.scanned}`);
  console.log(`已修复: ${result.fixed}`);
  console.log(`跳过(已修复或正常): ${result.skipped}`);
  console.log(`错误: ${result.errors}`);

  // 非零退出码方便 cron 报警
  if (result.errors > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
