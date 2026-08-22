import {
  createForumRouter,
  getForumDatabaseClient,
  getDatabaseClient,
  getMembershipDatabaseClient,
  requireAuth,
  optionalAuth,
  type AuthRequest,
  changePoints,
  getPointTransactions,
  getTotalPoints,
  POINT_REWARDS,
  getAvailableReward,
  POINT_LEVEL_CONFIG,
  getLocalDate,
  getLocalDateString,
  toDateTimeString,
  toDateString,
  signInLimiter,
  lotteryLimiter,
  exchangeLimiter,
  invalidateVipCache,
} from './forum-common.js';
import fs from 'fs';

const router = createForumRouter();

const SIGN_MILESTONES: Record<number, number> = {
  7: 50,
  30: 200,
  100: 500,
};

const SIGN_IN_CONFIG = {
  base_points: 1,
  repeated_day_base_points: 2,
  consecutive_bonus_max: 3,
  max_points_per_day: 5,
  milestones: Object.entries(SIGN_MILESTONES)
    .map(([days, points]) => ({ days: Number(days), points }))
    .sort((a, b) => a.days - b.days),
  description: '首日签到 1 积分；连续签到次日起额外加分，单日最高可得 5 积分'
} as const;

// 检查并发放里程碑奖励
async function checkAndGrantMilestone(db: ReturnType<typeof getForumDatabaseClient>, userId: number, consecutiveDays: number): Promise<{ milestone: number; points: number } | null> {
  for (const [days, points] of Object.entries(SIGN_MILESTONES)) {
    const milestone = parseInt(days);
    if (consecutiveDays === milestone) {
      // 使用本地时区的今天（与签到表一致）
      const todayLocal = getLocalDateString();
      // milestone 写在 point_transactions(积分流水表),已迁移到 membershipDb
      const membershipDb = getMembershipDatabaseClient();
      const existing = await membershipDb.queryOne<{ id: number }>(
        'SELECT id FROM point_transactions WHERE user_id = ? AND reason = ? AND DATE(created_at) = ?',
        [userId, 'sign_in_milestone', todayLocal]
      );
      if (!existing) {
        await changePoints({
          userId,
          amount: points,
          reason: 'sign_in_milestone',
          description: `连续签到 ${milestone} 天里程碑奖励 ${points} 积分`,
        });
        return { milestone, points };
      }
    }
  }
  return null;
}

async function calcConsecutiveDays(db: ReturnType<typeof getForumDatabaseClient>, userId: number): Promise<number> {
  // 统一使用本地时区（Asia/Shanghai）
  const today = getLocalDateString();
  const todaySign = await db.queryOne<{ id: number }>(
    'SELECT id FROM forum_sign_ins WHERE user_id = ? AND sign_date = ?',
    [userId, today]
  );
  let consecutiveDays = 0;
  if (!todaySign) {
    // 今天未签到，从昨天开始向前追溯
    const yesterday = new Date(getLocalDate().getTime() - 86400000);
    const yesterdayStr = toDateString(yesterday);
    const yesterdaySign = await db.queryOne<{ id: number }>(
      'SELECT id FROM forum_sign_ins WHERE user_id = ? AND sign_date = ?',
      [userId, yesterdayStr]
    );
    if (yesterdaySign) {
      let checkDate = new Date(yesterday);
      while (true) {
        const dateStr = toDateString(checkDate);
        const row = await db.queryOne<{ id: number }>(
          'SELECT id FROM forum_sign_ins WHERE user_id = ? AND sign_date = ?',
          [userId, dateStr]
        );
        if (!row) break;
        consecutiveDays++;
        checkDate = new Date(checkDate.getTime() - 86400000);
      }
    }
  } else {
    // 今天已签到，从今天开始向前追溯
    let checkDate = getLocalDate();
    while (true) {
      const dateStr = toDateString(checkDate);
      const row = await db.queryOne<{ id: number }>(
        'SELECT id FROM forum_sign_ins WHERE user_id = ? AND sign_date = ?',
        [userId, dateStr]
      );
      if (!row) break;
      consecutiveDays++;
      checkDate = new Date(checkDate.getTime() - 86400000);
    }
  }
  return consecutiveDays;
}

// GET /api/forum/sign-in/status
router.get('/forum/sign-in/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    // 统一使用本地时区
    const today = getLocalDateString();

    const todaySign = await db.queryOne<{ id: number }>(
      'SELECT id FROM forum_sign_ins WHERE user_id = ? AND sign_date = ?',
      [req.user!.id, today]
    );

    const consecutiveDays = await calcConsecutiveDays(db, req.user!.id);

    // 积分余额从 membershipDb 读
    const membershipDb = getMembershipDatabaseClient();
    const pointsRow = await membershipDb.queryOne<{ total_points: number }>(
      'SELECT total_points FROM user_points WHERE user_id = ?',
      [req.user!.id]
    );

    res.json({
      signed_today: !!todaySign,
      consecutive_days: consecutiveDays,
      total_points: pointsRow?.total_points ?? 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/forum/sign-in
router.post('/forum/sign-in', signInLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    // 统一使用本地时区
    const today = getLocalDateString();
    const userId = req.user!.id;

    const existing = await db.queryOne<{ id: number }>(
      'SELECT id FROM forum_sign_ins WHERE user_id = ? AND sign_date = ?',
      [userId, today]
    );
    if (existing) return res.status(400).json({ error: '今天已签到' });

    // 计算连续签到天数（签到前）
    const consecutiveDaysBefore = await calcConsecutiveDays(db, userId);
    const consecutiveDaysAfter = consecutiveDaysBefore + 1;

    // 基础 1 分，连续签到额外奖励
    let signInPoints = 1;
    if (consecutiveDaysBefore > 0) {
      signInPoints = Math.min(signInPoints + 1, 5);
    }

    await db.execute(
      'INSERT INTO forum_sign_ins (user_id, sign_date, points) VALUES (?, ?, ?)',
      [userId, today, signInPoints]
    );

    // 1. 发放基础签到积分
    await changePoints({
      userId,
      amount: signInPoints,
      reason: 'sign_in',
      description: `每日签到获得 ${signInPoints} 积分`,
    });

    // 2. 连续签到额外奖励（从第2天起，每天额外给 1 分，上限 3 分）
    let streakPoints = 0;
    if (consecutiveDaysBefore > 0) {
      streakPoints = Math.min(consecutiveDaysAfter - 1, 3);
      if (streakPoints > 0) {
        await changePoints({
          userId,
          amount: streakPoints,
          reason: 'sign_in_streak',
          description: `连续签到 ${consecutiveDaysAfter} 天额外奖励 ${streakPoints} 积分`,
        });
      }
    }

    // 3. 检查里程碑奖励
    const milestoneReward = await checkAndGrantMilestone(db, userId, consecutiveDaysAfter);

    // 计算本次签到总积分
    const totalEarned = signInPoints + streakPoints + (milestoneReward?.points ?? 0);

    res.json({
      message: `签到成功，获得 ${totalEarned} 积分`,
      points_earned: totalEarned,
      consecutive_days: consecutiveDaysAfter,
      total_points: await getTotalPoints(userId),
      streak_points: streakPoints,
      milestone: milestoneReward ? { days: milestoneReward.milestone, points: milestoneReward.points } : null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/forum/points/transactions — 积分流水
router.get('/forum/points/transactions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { page = '1', limit = '20' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * pageSize;
    const { records, total } = await getPointTransactions(req.user!.id, pageSize, offset);
    const totalPoints = await getTotalPoints(req.user!.id);
    res.json({ records, total, page: pageNum, page_size: pageSize, total_points: totalPoints });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 积分抽奖 ─────────────────────────────────────────────────────────────────

// 抽奖奖品配置
const LOTTERY_PRIZES = [
  { id: 1, name: '谢谢参与', points: 0, vip_days: 0, weight: 40 },
  { id: 2, name: '5 积分', points: 5, vip_days: 0, weight: 30 },
  { id: 3, name: '20 积分', points: 20, vip_days: 0, weight: 15 },
  { id: 4, name: '50 积分', points: 50, vip_days: 0, weight: 8 },
  { id: 5, name: '100 积分', points: 100, vip_days: 0, weight: 5 },
  { id: 6, name: 'VIP 1天', points: 0, vip_days: 1, weight: 2 },
];

const POINTS_EXCHANGE_CONFIG = {
  basic: { points: 500, vip_level: 'basic', duration_days: 30 },
  premium: { points: 1200, vip_level: 'premium', duration_days: 30 },
  ultimate: { points: 3000, vip_level: 'ultimate', duration_days: 30 },
} as const;

const DOWNLOAD_EXCHANGE_COST = 10;

function formatDateTime(date = new Date()) {
  return toDateTimeString(date);
}

async function getTodayLotteryCount(userId: number) {
  const db = getMembershipDatabaseClient();
  // 统一使用本地时区
  const today = getLocalDateString();
  const row = await db.queryOne<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM point_transactions
     WHERE user_id = ?
       AND reason IN ('lottery_cost', 'lottery_participation', 'lottery')
       AND DATE(created_at) = ?`,
    [userId, today]
  );
  return row?.count ?? 0;
}

function resolveLevelByPoints(points: number) {
  let current = POINT_LEVEL_CONFIG[0];
  for (const lv of POINT_LEVEL_CONFIG) {
    if (points >= lv.min_points) current = lv;
  }
  return current;
}

async function getDailyLotteryChances(userId: number) {
  const totalPoints = await getTotalPoints(userId);
  return resolveLevelByPoints(totalPoints).lottery_daily_chances;
}

router.get('/forum/points/config', optionalAuth, async (req: AuthRequest, res) => {
  try {
    // 按当前用户积分等级返回每日抽奖次数（游客按最低等级展示）
    const dailyChances = req.user
      ? await getDailyLotteryChances(req.user.id)
      : POINT_LEVEL_CONFIG[0].lottery_daily_chances;
    res.json({
      levels: POINT_LEVEL_CONFIG,
      sign_in: SIGN_IN_CONFIG,
      lottery: {
        daily_chances: dailyChances,
        prizes: LOTTERY_PRIZES.map((prize) => ({
          id: prize.id,
          name: prize.name,
          points: prize.points,
          vip_days: prize.vip_days,
          rate: prize.weight,
        })),
      },
      exchange: {
        vip_plans: Object.entries(POINTS_EXCHANGE_CONFIG).map(([level, config]) => ({
          level,
          points: config.points,
          vip_level: config.vip_level,
          duration_days: config.duration_days,
        })),
        download_permission: {
          cost: DOWNLOAD_EXCHANGE_COST,
          description: '任意伴奏单次下载权限（可累积）',
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/forum/lottery/status — 获取抽奖状态
router.get('/forum/lottery/status', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();

    // 已登录用户：按积分等级计算每日次数并扣除今日已用；游客无抽奖资格按最低等级展示
    const dailyChances = req.user
      ? await getDailyLotteryChances(req.user.id)
      : POINT_LEVEL_CONFIG[0].lottery_daily_chances;
    const usedToday = req.user ? await getTodayLotteryCount(req.user.id) : 0;
    const remainingChances = Math.max(0, dailyChances - usedToday);

    // 获取中奖记录（仅对已登录用户）
    let records: any[] = [];
    if (req.user) {
      records = await db.queryMany<{ id: number; prize_name: string; points: number; vip_days: number; created_at: string }>(
        `SELECT id, prize_name, points, vip_days, created_at
         FROM forum_lottery_records
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 10`,
        [req.user.id]
      );
    }

    res.json({
      remaining_chances: remainingChances,
      records,
      daily_chances: dailyChances,
      used_today: usedToday,
      prizes: LOTTERY_PRIZES.map((p) => ({
        id: p.id,
        name: p.name,
        points: p.points,
        vip_days: p.vip_days,
        rate: p.weight
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/forum/lottery — 抽奖
router.post('/forum/lottery', lotteryLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getForumDatabaseClient();
    const mainDb = getDatabaseClient();

    // 先扣除抽奖消耗的积分
    const lotteryCost = 5;
    const userPoints = await getTotalPoints(req.user!.id);
    if (userPoints < lotteryCost) {
      return res.status(400).json({ error: '积分不足，需要 5 积分才能抽奖' });
    }

    // 每日抽奖次数限制（按积分等级：毛胚/出道 1 次、炸场 2 次、厂牌 3 次、GOAT 5 次）
    const dailyChances = await getDailyLotteryChances(req.user!.id);
    const usedToday = await getTodayLotteryCount(req.user!.id);
    if (usedToday >= dailyChances) {
      return res.status(403).json({
        error: `今日抽奖次数已用完（${usedToday}/${dailyChances}）`,
        code: 'LOTTERY_DAILY_LIMIT_REACHED',
        daily_chances: dailyChances,
        used: usedToday,
        remaining: 0,
      });
    }

    await changePoints({
      userId: req.user!.id,
      amount: -lotteryCost,
      reason: 'lottery_cost',
      description: `抽奖消耗 ${lotteryCost} 积分`,
    });

    // 根据权重随机抽取奖品
    const totalWeight = LOTTERY_PRIZES.reduce((sum, p) => sum + p.weight, 0);
    let rand = Math.random() * totalWeight;
    let selectedPrize = LOTTERY_PRIZES[0];

    for (const prize of LOTTERY_PRIZES) {
      rand -= prize.weight;
      if (rand <= 0) {
        selectedPrize = prize;
        break;
      }
    }

    // 测试钩子：仅 MOCK_PAYMENT_ENABLED=true（开发/测试环境）时，
    // 允许请求头 x-lottery-force-prize 指定奖品，用于确定性覆盖 VIP 天等低概率分支；
    // 生产环境没有该开关，此头会被忽略。
    if (process.env.MOCK_PAYMENT_ENABLED === 'true') {
      const forcedId = Number(req.headers['x-lottery-force-prize']);
      const forced = Number.isFinite(forcedId)
        ? LOTTERY_PRIZES.find((p) => p.id === forcedId)
        : undefined;
      if (forced) selectedPrize = forced;
    }

    // 记录中奖信息
    await db.execute(
      `INSERT INTO forum_lottery_records (user_id, prize_name, points, vip_days, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user!.id, selectedPrize.name, selectedPrize.points, selectedPrize.vip_days, formatDateTime()]
    );

    // 发放积分奖励（如果中奖，扣除消耗后实际到账）
    let newPoints = 0;
    if (selectedPrize.points > 0) {
      await changePoints({
        userId: req.user!.id,
        amount: selectedPrize.points,
        reason: 'lottery_reward',
        description: `抽奖获得 ${selectedPrize.points} 积分（扣除5积分入场费）`,
      });
      // 净获得 = 奖励 - 消耗
      newPoints = selectedPrize.points - lotteryCost;
    } else {
      // 没中奖，只显示消耗
      newPoints = -lotteryCost;
    }

    // 发放 VIP 天数
    if (selectedPrize.vip_days > 0) {
      // 更新 VIP 过期时间
      const user = await mainDb.queryOne<{ vip_expire_at: string | null }>(
        'SELECT vip_expire_at FROM users WHERE id = ?',
        [req.user!.id]
      );
      const now = new Date();
      let expireDate: Date;
      if (user?.vip_expire_at && new Date(user.vip_expire_at) > now) {
        expireDate = new Date(new Date(user.vip_expire_at).getTime() + selectedPrize.vip_days * 86400000);
      } else {
        expireDate = new Date(now.getTime() + selectedPrize.vip_days * 86400000);
      }
      await mainDb.execute(
        'UPDATE users SET vip_expire_at = ? WHERE id = ?',
        [formatDateTime(expireDate), req.user!.id]
      );
    }

    const totalPoints = await getTotalPoints(req.user!.id);

    res.json({
      success: true,
      prize: {
        id: selectedPrize.id,
        name: selectedPrize.name,
        points: selectedPrize.points,
        vip_days: selectedPrize.vip_days,
      },
      points_earned: newPoints,
      total_points: totalPoints,
      remaining_chances: Math.max(0, dailyChances - usedToday - 1),
      daily_chances: dailyChances,
      used_today: usedToday + 1,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 积分兑换 VIP ─────────────────────────────────────────────────────────────

// POST /api/forum/points/exchange — 积分兑换 VIP
router.post('/forum/points/exchange', exchangeLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    const { level } = req.body as { level?: string };

    if (!level || !POINTS_EXCHANGE_CONFIG[level as keyof typeof POINTS_EXCHANGE_CONFIG]) {
      return res.status(400).json({ error: '无效的会员等级' });
    }

    const config = POINTS_EXCHANGE_CONFIG[level as keyof typeof POINTS_EXCHANGE_CONFIG];
    const db = getForumDatabaseClient();
    const mainDb = getDatabaseClient();

    // 检查积分是否足够
    const userPoints = await getTotalPoints(req.user!.id);
    if (userPoints < config.points) {
      return res.status(400).json({ error: `积分不足，需要 ${config.points} 积分，当前 ${userPoints} 积分` });
    }

    // 扣除积分
    await changePoints({
      userId: req.user!.id,
      amount: -config.points,
      reason: 'exchange',
      description: `积分兑换 ${config.duration_days} 天${level === 'basic' ? '基础' : level === 'premium' ? '高级' : '至尊'}会员`,
    });

    // 更新 VIP 状态
    const user = await mainDb.queryOne<{ vip_expire_at: string | null; vip_level: string | null }>(
      'SELECT vip_expire_at, vip_level FROM users WHERE id = ?',
      [req.user!.id]
    );
    const now = new Date();
    let expireDate: Date;
    if (user?.vip_expire_at && new Date(user.vip_expire_at) > now) {
      expireDate = new Date(new Date(user.vip_expire_at).getTime() + config.duration_days * 86400000);
    } else {
      expireDate = new Date(now.getTime() + config.duration_days * 86400000);
    }

    await mainDb.execute(
      'UPDATE users SET vip_level = ?, vip_expire_at = ? WHERE id = ?',
      [config.vip_level, formatDateTime(expireDate), req.user!.id]
    );
    invalidateVipCache(req.user!.id);

    const newTotalPoints = await getTotalPoints(req.user!.id);

    res.json({
      success: true,
      message: `成功兑换 ${config.duration_days} 天${level === 'basic' ? '基础' : level === 'premium' ? '高级' : '至尊'}会员`,
      points_spent: config.points,
      vip_level: config.vip_level,
      vip_expire_at: toDateTimeString(expireDate),
      total_points: newTotalPoints,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 积分兑换单次下载权限 ─────────────────────────────────────────────────────

// GET /api/forum/points/download-permission — 查询用户单次下载权限状态
router.get('/forum/points/download-permission', requireAuth, async (req: AuthRequest, res) => {
  try {
    const totalPoints = await getTotalPoints(req.user!.id);
    // 积分下载权限已迁到 membershipDb
    const db = getMembershipDatabaseClient();

    // 查询用户已购买的下载权限次数（每次兑换生成一条记录）
    const purchased = await db.queryMany<{ id: number }>(
      'SELECT id FROM point_download_permissions WHERE user_id = ? AND used = 0',
      [req.user!.id]
    );

    res.json({
      total_points: totalPoints,
      remaining_permissions: purchased.length,
      exchange_cost: DOWNLOAD_EXCHANGE_COST,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/forum/points/exchange-download — 积分兑换单次下载权限
router.post('/forum/points/exchange-download', exchangeLimiter, requireAuth, async (req: AuthRequest, res) => {
  try {
    const totalPoints = await getTotalPoints(req.user!.id);
    if (totalPoints < DOWNLOAD_EXCHANGE_COST) {
      return res.status(400).json({ error: `积分不足，需要 ${DOWNLOAD_EXCHANGE_COST} 积分，当前 ${totalPoints} 积分` });
    }

    const db = getMembershipDatabaseClient();

    // 扣除积分
    await changePoints({
      userId: req.user!.id,
      amount: -DOWNLOAD_EXCHANGE_COST,
      reason: 'exchange_download',
      description: `积分兑换单次下载权限（消耗 ${DOWNLOAD_EXCHANGE_COST} 积分）`,
    });

    // 写入下载权限记录（未使用状态）
    await db.execute(
      'INSERT INTO point_download_permissions (user_id, created_at, used) VALUES (?, ?, 0)',
      [req.user!.id, formatDateTime()]
    );

    const newTotalPoints = await getTotalPoints(req.user!.id);

    res.json({
      success: true,
      message: '成功兑换单次下载权限',
      points_spent: DOWNLOAD_EXCHANGE_COST,
      total_points: newTotalPoints,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
