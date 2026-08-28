import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getDatabaseClient, getMembershipDatabaseClient } from '../database/client.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { invalidateVipCache } from '../middleware/vip.js';
import { toDateTimeString } from '../utils/timezone.js';
import { config } from '../config.js';

const router = Router();

// 虎皮椒配置(从 config() 读,延迟到首次使用,避免启动期硬性要求)
function xunhu() {
  return config().xunhu;
}

// 价格配置
const PRICE_CONFIG: Record<string, { amount: string; name: string; days: number }> = {
  basic: { amount: '19.90', name: '基础会员 - 月度', days: 30 },
  premium: { amount: '49.90', name: '高级会员 - 月度', days: 30 },
  ultimate: { amount: '99.90', name: '至尊会员 - 月度', days: 30 },
};

// MD5签名
function generateSign(params: Record<string, string>, appsecret: string): string {
  const sorted = Object.keys(params)
    .filter(k => k !== 'sign' && params[k] !== '' && params[k] !== undefined)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('md5').update(sorted + appsecret).digest('hex');
}

/**
 * 双写 VIP 状态(真相源 membership.vip_users + 冗余快照 users.vip_*)
 *
 * 设计要点:
 * - membership.vip_users 是 source of truth,代码读这一份
 * - users.vip_level/vip_expire_at/is_vip 保留作历史快照(订单溯源、向后兼容)
 * - 用 UPSERT 风格:如果用户没有 vip_users 行,先 INSERT IGNORE 占位
 */
async function setUserVipStatus(
  userId: number,
  vipLevel: 'free' | 'basic' | 'premium' | 'ultimate',
  expireAt: Date | null,
  source: 'payment' | 'lottery' | 'admin_grant' | 'system',
  tx: import('../database/client.js').DatabaseClient = getDatabaseClient(),
): Promise<void> {
  const database = tx === getDatabaseClient() ? getDatabaseClient() : tx;
  const membershipDb = getMembershipDatabaseClient();

  const isVip = vipLevel !== 'free' ? 1 : 0;
  const expireStr = expireAt ? toDateTimeString(expireAt) : null;

  // 1) 真相源:membership.vip_users
  // INSERT IGNORE 占位(如果 user_id 不存在),然后 UPDATE
  await membershipDb.execute(
    'INSERT IGNORE INTO vip_users (user_id, vip_level, is_vip, vip_expire_at, source) VALUES (?, ?, 0, NULL, ?)',
    [userId, 'free', source],
  );
  await membershipDb.execute(
    'UPDATE vip_users SET vip_level = ?, is_vip = ?, vip_expire_at = ?, source = ? WHERE user_id = ?',
    [vipLevel, isVip, expireStr, source, userId],
  );

  // 2) 冗余快照:users.vip_*(保持只读风格,业务不再用)
  await database.execute(
    'UPDATE users SET vip_level = ?, vip_expire_at = ?, is_vip = ? WHERE id = ?',
    [vipLevel, expireStr, isVip, userId],
  );
}

// 生成随机字符串
function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

// POST /api/payment/create-order
router.post('/payment/create-order', requireAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const membershipDb = getMembershipDatabaseClient();
  const { vip_level, pay_type } = req.body; // pay_type: 'wechat' | 'alipay'

  if (!['basic', 'premium', 'ultimate'].includes(vip_level)) {
    return res.status(400).json({ error: '无效的会员等级' });
  }

  if (!['wechat', 'alipay'].includes(pay_type || '')) {
    return res.status(400).json({ error: '请选择支付方式（wechat/alipay）' });
  }

  const priceConfig = PRICE_CONFIG[vip_level];
  const tradeOrderId = `ORDER_${Date.now()}_${req.user!.id}_${Math.random().toString(36).substring(7)}`;

  // 如果没有配置虎皮椒密钥且未开启模拟支付，拒绝真实充值请求
  const x = xunhu();
  if (!x.appId || !x.appSecret) {
    if (!x.mockEnabled) {
      return res.status(503).json({ error: '支付通道暂不可用，请稍后再试' });
    }
    // 模拟支付：仅在 x.mockEnabled=true 时可用
    const insert = await database.execute(
      'INSERT INTO orders (user_id, vip_level, amount, stripe_session_id, status) VALUES (?, ?, ?, ?, ?)',
      [req.user!.id, vip_level, parseFloat(priceConfig.amount), tradeOrderId, 'completed']
    );

    if (!insert.insertId) {
      return res.status(500).json({ error: '创建订单失败，请稍后重试' });
    }

    // 直接开通VIP（叠加时长：从未过期的现有到期时间开始计算）
    // 真相源已经从 users 迁到 membership.vip_users,这里双写两份
    const existingVip = await membershipDb.queryOne<{ vip_expire_at: string | null }>(
      'SELECT vip_expire_at FROM vip_users WHERE user_id = ?',
      [req.user!.id]
    );
    const now = new Date();
    let expireBase: Date;
    if (existingVip?.vip_expire_at && new Date(existingVip.vip_expire_at) > now) {
      // 当前会员未过期，从现有到期时间叠加
      expireBase = new Date(existingVip.vip_expire_at);
    } else {
      // 当前无有效会员，从现在起算
      expireBase = now;
    }
    expireBase.setDate(expireBase.getDate() + priceConfig.days);

    await setUserVipStatus(
      req.user!.id,
      vip_level as 'basic' | 'premium' | 'ultimate',
      expireBase,
      'payment',
    );

    // 同步写 vip_orders(便于审计/对账)
    await membershipDb.execute(
      `INSERT INTO vip_orders (user_id, vip_level, amount_cents, duration_days, status, external_order_no, paid_at, expire_at)
       VALUES (?, ?, ?, ?, 'completed', ?, ?, ?)`,
      [
        req.user!.id,
        vip_level,
        Math.round(parseFloat(priceConfig.amount) * 100),
        priceConfig.days,
        tradeOrderId,
        toDateTimeString(now),
        toDateTimeString(expireBase),
      ],
    );

    invalidateVipCache(req.user!.id);

    return res.json({
      mode: 'mock',
      message: `模拟支付成功！已开通${priceConfig.name}`,
      order_id: insert.insertId
    });
  }

  // 创建订单记录
  await database.execute(
    'INSERT INTO orders (user_id, vip_level, amount, stripe_session_id, status) VALUES (?, ?, ?, ?, ?)',
    [req.user!.id, vip_level, parseFloat(priceConfig.amount), tradeOrderId, 'pending']
  );

  // 构建虎皮椒支付参数
  const baseUrl = process.env.BASE_URL || `http://${req.headers.host}`;
  const clientUrl = process.env.CLIENT_URL || req.headers.origin || 'http://localhost:5173';

  const params: Record<string, string> = {
    version: '1.1',
    appid: x.appId,
    trade_order_id: tradeOrderId,
    total_fee: priceConfig.amount,
    title: priceConfig.name,
    time: Math.floor(Date.now() / 1000).toString(),
    notify_url: `${baseUrl}/api/payment/notify`,
    return_url: `${clientUrl}/payment/success`,
    nonce_str: generateNonce(),
    type: pay_type,
  };

  params.sign = generateSign(params, x.appSecret);

  try {
    // 发起请求到虎皮椒
    const formBody = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const response = await fetch(x.gateway, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody,
    });

    const result = await response.json() as any;

    if (result.errcode === 0 && result.url) {
      res.json({ url: result.url, order_id: tradeOrderId });
    } else {
      console.error('虎皮椒支付错误:', result);
      res.status(500).json({ error: result.errmsg || '支付创建失败' });
    }
  } catch (error: any) {
    console.error('支付请求失败:', error.message);
    res.status(500).json({ error: '支付服务暂时不可用，请稍后再试' });
  }
});

// POST /api/payment/notify - 虎皮椒异步回调
router.post('/payment/notify', async (req: Request, res: Response) => {
  const database = getDatabaseClient();
  const params = req.body as Record<string, string>;
  const x = xunhu();

  if (!x.appSecret) {
    return res.status(400).send('not configured');
  }

  // 验签
  const expectedSign = generateSign(params, x.appSecret);
  if (params.sign !== expectedSign) {
    console.error('回调验签失败');
    return res.status(400).send('sign error');
  }

  // 验证 appid 归属
  if (params.appid && params.appid !== x.appId) {
    console.error('回调 appid 不匹配:', params.appid, 'expected:', x.appId);
    return res.status(400).send('appid mismatch');
  }

  // 检查支付状态
  if (params.status !== 'OD') {
    return res.send('success'); // 非成功状态也返回 success 避免重复通知
  }

  const tradeOrderId = params.trade_order_id;

  let orderUserId: number | null = null;

  try {
    // 第一阶段:在主库事务里锁单 + 写快照(防止并发)
    interface OrderInfo { user_id: number; vip_level: string }
    let orderInfo: OrderInfo | undefined;
    let expireAtStr: string | null = null;
    await database.transaction(async (tx) => {
      // 用 FOR UPDATE 锁住订单行，防止并发回调都通过 status 检查
      const order = await tx.queryOne<{ id: number; user_id: number; vip_level: string; status: string }>(
        'SELECT id, user_id, vip_level, status FROM orders WHERE stripe_session_id = ? FOR UPDATE',
        [tradeOrderId]
      );
      if (!order) {
        console.error('订单不存在:', tradeOrderId);
        throw new Error('ORDER_NOT_FOUND'); // 触发 rollback
      }

      if (order.status === 'completed') {
        throw new Error('ORDER_ALREADY_COMPLETED'); // 跳过本次处理
      }

      // 叠加 VIP 时长(从 membership.vip_users 读最新过期时间,避免双写不一致)
      // 这里用 mainDb 是为了保证在主库事务里;如果 vip_users 也行,效果一样
      // 因为数据库共享同一实例,membershipDb.queryOne 拿到的是快照
      const membershipDb = getMembershipDatabaseClient();
      const existingVip = await membershipDb.queryOne<{ vip_expire_at: string | null }>(
        'SELECT vip_expire_at FROM vip_users WHERE user_id = ?',
        [order.user_id]
      );
      const priceConfig = PRICE_CONFIG[order.vip_level];
      const now = new Date();
      let expireBase: Date;
      if (existingVip?.vip_expire_at && new Date(existingVip.vip_expire_at) > now) {
        expireBase = new Date(existingVip.vip_expire_at);
      } else {
        expireBase = now;
      }
      expireBase.setDate(expireBase.getDate() + (priceConfig?.days || 30));
      expireAtStr = toDateTimeString(expireBase);

      // 主库事务里只更新 orders(状态)和 users(快照)
      await tx.execute('UPDATE orders SET status = ? WHERE stripe_session_id = ?', ['completed', tradeOrderId]);
      await tx.execute('UPDATE users SET vip_level = ?, vip_expire_at = ?, is_vip = 1 WHERE id = ?', [
        order.vip_level,
        expireAtStr,
        order.user_id
      ]);

      orderInfo = { user_id: order.user_id, vip_level: order.vip_level };
    });

    // 第二阶段:在 membership 库写 vip_users(真相源) + vip_orders(独立事务)
    // 即使这里失败,下一次 callback 重试时也会被主库锁单守卫挡住
    if (orderInfo) {
      const membershipDb = getMembershipDatabaseClient();
      await setUserVipStatus(
        orderInfo.user_id,
        orderInfo.vip_level as 'basic' | 'premium' | 'ultimate',
        expireAtStr ? new Date(expireAtStr) : null,
        'payment',
      );
      const priceConfig = PRICE_CONFIG[orderInfo.vip_level];
      await membershipDb.execute(
        `INSERT INTO vip_orders (user_id, vip_level, amount_cents, duration_days, status, external_order_no, paid_at, expire_at)
         VALUES (?, ?, ?, ?, 'completed', ?, ?, ?)`,
        [
          orderInfo.user_id,
          orderInfo.vip_level,
          Math.round(parseFloat(priceConfig.amount) * 100),
          priceConfig.days,
          tradeOrderId,
          toDateTimeString(new Date()),
          expireAtStr,
        ],
      );
    }

    orderUserId = orderInfo?.user_id ?? null;
    console.log(`VIP activated via payment: user ${orderInfo?.user_id} -> ${orderInfo?.vip_level}`);

    // 通知管理员：会员购买成功
    if (orderInfo) {
      const { createAdminNotification } = await import('./admin-notifications-helper.js');
      createAdminNotification({
        type: 'vip_purchased',
        title: '会员购买',
        content: `用户 ${orderInfo.user_id} 购买了 ${PRICE_CONFIG[orderInfo.vip_level]?.name || orderInfo.vip_level}`,
        data: { userId: orderInfo.user_id, vipLevel: orderInfo.vip_level }
      }).catch(() => {});
    }
  } catch (err: any) {
    // ORDER_NOT_FOUND 和 ORDER_ALREADY_COMPLETED 是预期情况，返回 success 避免重复通知
    if (!['ORDER_NOT_FOUND', 'ORDER_ALREADY_COMPLETED'].includes(err.message)) {
      console.error('支付回调处理异常:', err);
    }
  }

  if (orderUserId) invalidateVipCache(orderUserId);

  // 始终返回 success：成功则业务完成，失败则防止虎皮椒重试通知
  res.send('success');
});

// GET /api/payment/orders - 用户订单列表
router.get('/payment/orders', requireAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
  const orders = await database.queryMany(
    'SELECT id, vip_level, amount, status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC',
    [req.user!.id]
  );
  res.json(orders);
});

export default router;
