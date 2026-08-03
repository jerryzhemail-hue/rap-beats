import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getDatabaseClient } from '../database/client.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { invalidateVipCache } from '../middleware/vip.js';
import { toDateTimeString } from '../utils/timezone.js';

const router = Router();

// 虎皮椒配置
const XUNHU_APPID = process.env.XUNHU_APPID || '';
const XUNHU_APPSECRET = process.env.XUNHU_APPSECRET || '';
const XUNHU_GATEWAY = process.env.XUNHU_GATEWAY || 'https://api.xunhupay.com/payment/do.html';
// 显式开启模拟支付（仅开发/测试环境使用，勿在生产环境启用）
const MOCK_PAYMENT_ENABLED = process.env.MOCK_PAYMENT_ENABLED === 'true';

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

// 生成随机字符串
function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

// POST /api/payment/create-order
router.post('/payment/create-order', requireAuth, async (req: AuthRequest, res: Response) => {
  const database = getDatabaseClient();
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
  if (!XUNHU_APPID || !XUNHU_APPSECRET) {
    if (!MOCK_PAYMENT_ENABLED) {
      return res.status(503).json({ error: '支付通道暂不可用，请稍后再试' });
    }
    // 模拟支付：仅在 MOCK_PAYMENT_ENABLED=true 时可用
    const insert = await database.execute(
      'INSERT INTO orders (user_id, vip_level, amount, stripe_session_id, status) VALUES (?, ?, ?, ?, ?)',
      [req.user!.id, vip_level, parseFloat(priceConfig.amount), tradeOrderId, 'completed']
    );

    if (!insert.insertId) {
      return res.status(500).json({ error: '创建订单失败，请稍后重试' });
    }

    // 直接开通VIP（叠加时长：从未过期的现有到期时间开始计算）
    const existingUser = await database.queryOne<{ vip_expire_at: string | null }>(
      'SELECT vip_expire_at FROM users WHERE id = ?',
      [req.user!.id]
    );
    const now = new Date();
    let expireBase: Date;
    if (existingUser?.vip_expire_at && new Date(existingUser.vip_expire_at) > now) {
      // 当前会员未过期，从现有到期时间叠加
      expireBase = new Date(existingUser.vip_expire_at);
    } else {
      // 当前无有效会员，从现在起算
      expireBase = now;
    }
    expireBase.setDate(expireBase.getDate() + priceConfig.days);
    await database.execute('UPDATE users SET vip_level = ?, vip_expire_at = ? WHERE id = ?', [
      vip_level,
      toDateTimeString(expireBase),
      req.user!.id
    ]);
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
    appid: XUNHU_APPID,
    trade_order_id: tradeOrderId,
    total_fee: priceConfig.amount,
    title: priceConfig.name,
    time: Math.floor(Date.now() / 1000).toString(),
    notify_url: `${baseUrl}/api/payment/notify`,
    return_url: `${clientUrl}/payment/success`,
    nonce_str: generateNonce(),
    type: pay_type,
  };

  params.sign = generateSign(params, XUNHU_APPSECRET);

  try {
    // 发起请求到虎皮椒
    const formBody = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const response = await fetch(XUNHU_GATEWAY, {
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

  if (!XUNHU_APPSECRET) {
    return res.status(400).send('not configured');
  }

  // 验签
  const expectedSign = generateSign(params, XUNHU_APPSECRET);
  if (params.sign !== expectedSign) {
    console.error('回调验签失败');
    return res.status(400).send('sign error');
  }

  // 验证 appid 归属
  if (params.appid && params.appid !== XUNHU_APPID) {
    console.error('回调 appid 不匹配:', params.appid, 'expected:', XUNHU_APPID);
    return res.status(400).send('appid mismatch');
  }

  // 检查支付状态
  if (params.status !== 'OD') {
    return res.send('success'); // 非成功状态也返回 success 避免重复通知
  }

  const tradeOrderId = params.trade_order_id;

  let orderUserId: number | null = null;

  try {
    await database.transaction(async (tx) => {
      // 用 FOR UPDATE 锁住订单行，防止并发回调都通过 status 检查
      const order = await tx.queryOne<any>(
        'SELECT * FROM orders WHERE stripe_session_id = ? FOR UPDATE',
        [tradeOrderId]
      );
      if (!order) {
        console.error('订单不存在:', tradeOrderId);
        throw new Error('ORDER_NOT_FOUND'); // 触发 rollback
      }

      if (order.status === 'completed') {
        throw new Error('ORDER_ALREADY_COMPLETED'); // 跳过本次处理
      }

      // 叠加 VIP 时长
      const priceConfig = PRICE_CONFIG[order.vip_level];
      const existingUser = await tx.queryOne<{ vip_expire_at: string | null }>(
        'SELECT vip_expire_at FROM users WHERE id = ? FOR UPDATE',
        [order.user_id]
      );
      const now = new Date();
      let expireBase: Date;
      if (existingUser?.vip_expire_at && new Date(existingUser.vip_expire_at) > now) {
        expireBase = new Date(existingUser.vip_expire_at);
      } else {
        expireBase = now;
      }
      expireBase.setDate(expireBase.getDate() + (priceConfig?.days || 30));

      await tx.execute('UPDATE orders SET status = ? WHERE stripe_session_id = ?', ['completed', tradeOrderId]);
      await tx.execute('UPDATE users SET vip_level = ?, vip_expire_at = ? WHERE id = ?', [
        order.vip_level,
        toDateTimeString(expireBase),
        order.user_id
      ]);

      orderUserId = order.user_id;
      console.log(`VIP activated via payment: user ${order.user_id} -> ${order.vip_level}`);
    });
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
