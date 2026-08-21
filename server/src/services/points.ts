import { getForumDatabaseClient } from '../database/index.js';
import { getLocalDateString, toDateTimeString } from '../utils/timezone.js';

// 积分变动原因枚举
export type PointReason =
  | 'sign_in'           // 每日签到
  | 'sign_in_streak'    // 连续签到奖励
  | 'sign_in_milestone' // 签到里程碑奖励
  | 'lottery_cost'      // 抽奖消耗
  | 'lottery_participation' // 抽奖参与
  | 'lottery_reward'    // 抽奖奖励
  | 'post_created'      // 发布帖子
  | 'comment_created'   // 发布评论
  | 'post_liked'        // 帖子被点赞
  | 'comment_liked'     // 评论被点赞
  | 'post_favorited'    // 帖子被收藏
  | 'task_reward'       // 任务奖励
  | 'admin_adjust'      // 管理员调整
  | 'exchange'          // 积分兑换消费
  | 'deduction';        // 积分扣除

interface PointChangeOptions {
  userId: number;
  amount: number;          // 正数增加，负数减少
  reason: PointReason;
  description?: string;     // 可读描述，如 "发布帖子奖励"
}

interface PointRecord {
  id: number;
  user_id: number;
  change: number;
  reason: point_reason;
  description: string | null;
  created_at: string;
}

type point_reason = string; // MySQL ENUM is enforced at the application layer

/**
 * 统一积分变动函数：写流水 + 更新总额（原子操作，防并发竞态）
 */
export async function changePoints(options: PointChangeOptions): Promise<number> {
  const { userId, amount, reason, description } = options;
  if (amount === 0) return getTotalPoints(userId);

  const db = getForumDatabaseClient();

  try {
    // 使用事务保证原子性
    await db.transaction(async (tx) => {
      // 1. 扣减时校验余额（用 FOR UPDATE 锁行；如果行不存在则视为余额不足拒绝）
      if (amount < 0) {
        const row = await tx.queryOne<{ total_points: number }>(
          'SELECT total_points FROM forum_user_points WHERE user_id = ? FOR UPDATE',
          [userId]
        );
        if (!row || row.total_points + amount < 0) {
          throw new Error('积分不足');
        }
      }

      // 2. 写入流水
      await tx.execute(
        `INSERT INTO forum_point_transactions (user_id, \`change\`, reason, description, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, amount, reason, description ?? reason, toDateTimeString(new Date())]
      );

      // 3. 更新用户积分总额：INSERT IGNORE 防重复插入，UPDATE 做原子加减
      // 注意：INSERT IGNORE 在主键冲突时静默忽略，但行不存在时会插入（amount<0时不会走到这里）
      await tx.execute(
        'INSERT IGNORE INTO forum_user_points (user_id, total_points, updated_at) VALUES (?, 0, ?)',
        [userId, toDateTimeString(new Date())]
      );
      await tx.execute(
        'UPDATE forum_user_points SET total_points = total_points + ?, updated_at = ? WHERE user_id = ?',
        [amount, toDateTimeString(new Date()), userId]
      );
    });

    return getTotalPoints(userId);
  } catch (err) {
    console.error(`[points] Error in changePoints: userId=${userId}, amount=${amount}, reason=${reason}`, err);
    throw err;
  }
}

/**
 * 获取用户当前积分总额
 */
export async function getTotalPoints(userId: number): Promise<number> {
  const db = getForumDatabaseClient();
  const row = await db.queryOne<{ total_points: number }>(
    'SELECT total_points FROM forum_user_points WHERE user_id = ?',
    [userId]
  );
  return row?.total_points ?? 0;
}

/**
 * 获取积分流水记录
 */
export async function getPointTransactions(
  userId: number,
  limit = 20,
  offset = 0
): Promise<{ records: PointRecord[]; total: number }> {
  const db = getForumDatabaseClient();
  const [countRow, records] = await Promise.all([
    db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM forum_point_transactions WHERE user_id = ?',
      [userId]
    ),
    db.queryMany<PointRecord>(
      `SELECT * FROM forum_point_transactions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    ),
  ]);
  return { records, total: countRow?.count ?? 0 };
}

// reason 中文映射
export const pointReasonLabels: Record<PointReason, string> = {
  sign_in: '每日签到',
  sign_in_streak: '连续签到奖励',
  sign_in_milestone: '签到里程碑',
  lottery_cost: '抽奖消耗',
  lottery_participation: '积分抽奖',
  lottery_reward: '抽奖奖励',
  post_created: '发布帖子',
  comment_created: '发布评论',
  post_liked: '帖子被点赞',
  comment_liked: '评论被点赞',
  post_favorited: '帖子被收藏',
  task_reward: '任务奖励',
  admin_adjust: '管理员调整',
  exchange: '积分兑换',
  deduction: '积分扣除',
};

// ─── Phase 2: 积分奖励规则 ───────────────────────────────────────────────────

// 等级配置（积分倍率）
type PointLevelConfigItem = {
  name: string;
  min_points: number;
  lottery_daily_chances: number;
  points_multiplier: number;
};

export const POINT_LEVEL_CONFIG: PointLevelConfigItem[] = [
  { name: '毛胚', min_points: 0, lottery_daily_chances: 1, points_multiplier: 1 },
  { name: '出道', min_points: 100, lottery_daily_chances: 1, points_multiplier: 1 },
  { name: '炸场', min_points: 500, lottery_daily_chances: 2, points_multiplier: 2 },
  { name: '厂牌', min_points: 1000, lottery_daily_chances: 3, points_multiplier: 2 },
  { name: 'GOAT', min_points: 5000, lottery_daily_chances: 5, points_multiplier: 2 }
];

function resolveLevelByPoints(points: number) {
  let current = POINT_LEVEL_CONFIG[0];
  for (const lv of POINT_LEVEL_CONFIG) {
    if (points >= lv.min_points) current = lv;
  }
  return current;
}

// 各行为基础奖励分值
export const POINT_REWARDS = {
  post_created: 5,      // 发布帖子基础奖励
  comment_created: 2,   // 发布评论基础奖励
  post_liked: 1,        // 帖子被点赞（给作者）
  comment_liked: 1,      // 评论被点赞（给作者）
  post_favorited: 1,    // 帖子被收藏（给作者）
} as const;

// 每日各行为积分上限（防止刷分）
export const POINT_DAILY_LIMITS = {
  post_created: 10,     // 每天最多通过发帖获得 10 积分
  comment_created: 10,  // 每天最多通过评论获得 10 积分
  post_liked: 5,        // 每天最多通过帖子被赞获得 5 积分
  comment_liked: 5,     // 每天最多通过评论被赞获得 5 积分
  post_favorited: 5,    // 每天最多通过帖子被收藏获得 5 积分
} as const;

type PointRewardKey = keyof typeof POINT_REWARDS;

/**
 * 查询某用户在当天通过某行为已获得多少积分
 */
export async function getTodayPointsByReason(
  userId: number,
  reason: PointRewardKey
): Promise<number> {
  const db = getForumDatabaseClient();
  // 统一使用本地时区的今天
  const today = getLocalDateString();
  const row = await db.queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(\`change\`), 0) as total
     FROM forum_point_transactions
     WHERE user_id = ? AND reason = ? AND DATE(created_at) = ?`,
    [userId, reason, today]
  );
  return row?.total ?? 0;
}

/**
 * 检查并返回可奖励的积分（考虑每日上限 + 等级倍率）
 */
export async function getAvailableReward(
  userId: number,
  reason: PointRewardKey,
  basePoints: number
): Promise<number> {
  const todayEarned = await getTodayPointsByReason(userId, reason);
  const limit = POINT_DAILY_LIMITS[reason];
  const remaining = Math.max(0, limit - todayEarned);
  
  // 应用等级倍率（炸场及以上用户积分翻倍）
  const totalPoints = await getTotalPoints(userId);
  const multiplier = resolveLevelByPoints(totalPoints).points_multiplier;
  const pointsWithMultiplier = basePoints * multiplier;
  
  return Math.min(pointsWithMultiplier, remaining);
}
