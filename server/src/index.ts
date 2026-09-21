import 'dotenv/config';
import http from 'node:http';
import { buildApp } from './app.js';
import {
  initDatabase,
  getDatabaseClient,
  getForumDatabaseClient,
  getMembershipDatabaseClient,
  initMySqlDatabaseClientFromEnv,
} from './database/index.js';
import { initStorage } from './services/storage.js';
import { checkSidecarHealth } from './services/bpmDetector.js';
import multer from 'multer';

const app = buildApp();
const PORT = 3000;

// 健康检查（Docker 健康检查 & 负载均衡探活）
app.get('/api/health', async (_req, res) => {
  const health: {
    status: 'ok' | 'degraded';
    timestamp: string;
    services: Record<string, { status: 'ok' | 'error'; message?: string }>;
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {},
  };

  try {
    const db = getDatabaseClient();
    await db.queryOne('SELECT 1');
    health.services.database = { status: 'ok' };
  } catch (err: any) {
    health.status = 'degraded';
    health.services.database = { status: 'error', message: err.message };
  }

  try {
    const forumDb = getForumDatabaseClient();
    await forumDb.queryOne('SELECT 1');
    health.services.forumDatabase = { status: 'ok' };
  } catch (err: any) {
    health.status = 'degraded';
    health.services.forumDatabase = { status: 'error', message: err.message };
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

async function startServer() {
  initMySqlDatabaseClientFromEnv();
  await initDatabase(getDatabaseClient(), getForumDatabaseClient(), getMembershipDatabaseClient());

  // 初始化存储
  initStorage();

  // ── 反向代理可信度 ─────────────────────────────────────────────────────
  // Express 的 req.ip 默认只信任直连 IP。如果在 Nginx/Cloudflare 后部署，
  // 必须设置 trust proxy，否则 req.ip 永远是 127.0.0.1，
  // 所有 IP 维度的限流会被绕过（一个 IP 攻击 = 全部用户被限制 / 或反过来全不受限制）。
  //
  // 配置方式（env）：TRUST_PROXY=1 表示信任 1 层代理，或具体 IP/CIDR 列表。
  // 这里做启动期检查：生产环境若未设置则 fail-fast（避免静默错误）。
  const trustProxyEnv = process.env.TRUST_PROXY;
  if (trustProxyEnv !== undefined) {
    app.set('trust proxy', trustProxyEnv);
    console.log(`[server] trust proxy = ${trustProxyEnv}`);
  } else if ((process.env.NODE_ENV || 'development').toLowerCase() === 'production') {
    // P0-9 配套：生产环境未设置 TRUST_PROXY 会导致 req.ip 错配，
    // 匿名试听 IP 计数、虎皮椒 IP 白名单、IP 限流全部失效。
    console.warn(
      '[server] 警告：NODE_ENV=production 但未设置 TRUST_PROXY。\n' +
      '  req.ip 将永远是直连 IP（在反向代理后 = 127.0.0.1），\n' +
      '  所有基于 IP 的限流/计数/白名单将失效。\n' +
      '  推荐设置：TRUST_PROXY=1（信任 1 层代理）或具体的代理 CIDR。'
    );
  }

  // 探测 BPM/调性 sidecar（失败会自动降级到 Python 子进程 / JS 检测）
  const sidecarOk = await checkSidecarHealth();
  console.log(sidecarOk
    ? '[BpmDetector] sidecar 可用（librosa，最准确）'
    : '[BpmDetector] sidecar 不可用，将降级到 Python 子进程 / JS 检测');

  // 动态 import 路由以避免循环依赖
  const [
    { default: beatsRouter },
    { default: rappersRouter },
    { default: authRouter },
    { default: uploadRouter },
    { default: favoritesRouter },
    { default: commentsRouter },
    { default: userRouter },
    { default: userSearchRouter },
    { default: userSocialRouter },
    { default: adminRouter },
    { default: paymentRouter },
    { default: bannersRouter },
    { default: previewRouter },
    { default: forumRouter },
    { default: feedbackRouter },
    { default: beatmakerRouter },
    { default: adminBeatmakerRouter },
    { default: homeFooterRouter },
    { default: adminNotificationsRouter },
  ] = await Promise.all([
    import('./routes/beats.js'),
    import('./routes/rappers.js'),
    import('./routes/auth.js'),
    import('./routes/upload.js'),
    import('./routes/favorites.js'),
    import('./routes/comments.js'),
    import('./routes/user.js'),
    import('./routes/user-search.js'),
    import('./routes/user-social.js'),
    import('./routes/admin.js'),
    import('./routes/payment.js'),
    import('./routes/banners.js'),
    import('./routes/preview.js'),
    import('./routes/forum.js'),
    import('./routes/feedback.js'),
    import('./routes/beatmaker.js'),
    import('./routes/admin-beatmaker.js'),
    import('./routes/home-footer.js'),
    import('./routes/admin-notifications.js'),
  ]);

  app.use('/api', beatsRouter);
  app.use('/api/rappers', rappersRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/beatmaker', beatmakerRouter);
  app.use('/api', uploadRouter);
  app.use('/api', favoritesRouter);
  app.use('/api', commentsRouter);
  app.use('/api', userRouter);
  app.use('/api', userSearchRouter);
  app.use('/api', userSocialRouter);
  app.use('/api', adminRouter);
  app.use('/api/admin/beatmaker-applications', adminBeatmakerRouter);
  app.use('/api/admin/notifications', adminNotificationsRouter);
  app.use('/api', paymentRouter);
  app.use('/api', bannersRouter);
  app.use('/api', previewRouter);
  app.use('/api', forumRouter);
  app.use('/api', feedbackRouter);
  app.use('/api', homeFooterRouter);

  const homepageConfigRouter = (await import('./routes/homepage-config.js')).default;
  app.use('/api/homepage-config', homepageConfigRouter);

  const membershipBannerRouter = (await import('./routes/membership-banner.js')).default;
  app.use('/api/membership-banner', membershipBannerRouter);

  const systemNotificationsRouter = (await import('./routes/system-notifications.js')).default;
  app.use('/api/system-notifications', systemNotificationsRouter);

  // Multer 文件校验错误 → 400
  app.use((err: any, _req: any, res: any, next: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '文件大小超过限制（最大50MB）' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) return res.status(400).json({ error: err.message });
    next();
  });

  // 全局错误兜底
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error('[Server Error]', err?.message ?? err);
    res.status(500).json({ error: '服务器内部错误，请稍后再试' });
  });

  // 端口从环境变量读取，支持 docker -e PORT=8080 映射
  const PORT = parseInt(process.env.PORT || '3000', 10);
  if (!Number.isFinite(PORT) || PORT < 1024 || PORT > 65535) {
    throw new Error(`[startup] PORT=${process.env.PORT} 不在有效范围 1024-65535`);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Rap Beats Server running on http://0.0.0.0:${PORT}`);
  });

  // ─── 优雅关闭（SIGTERM/SIGINT）───────────────────────────────────
  // Docker stop / k8s 终止时发送 SIGTERM，守护进程发送 SIGINT
  // 目的：1) 停止接收新连接 2) 等待现有请求处理完毕 3) 关闭数据库/存储连接池
  const SHUTDOWN_TIMEOUT_MS = 10_000;

  let isShuttingDown = false;

  async function shutdown(signal: string) {
    if (isShuttingDown) return; // 防止重复触发
    isShuttingDown = true;
    console.log(`\n[${signal}] 收到退出信号，开始优雅关闭（最多 ${SHUTDOWN_TIMEOUT_MS}ms）...`);

    // 1) 停止接收新连接
    server.close(async () => {
      console.log('[shutdown] HTTP 服务器已关闭');

      // 2) 关闭三个数据库连接池（MySQL 长连接需要显式 end）
      const closeAll = async (name: string, closeFn: (() => Promise<void>) | undefined) => {
        if (!closeFn) return;
        try {
          await closeFn();
          console.log(`[shutdown] ${name} 连接池已关闭`);
        } catch (e: any) {
          console.error(`[shutdown] ${name} 关闭时出错:`, e?.message);
        }
      };

      await closeAll('主库', getDatabaseClient()?.close);
      await closeAll('Forum库', getForumDatabaseClient()?.close);
      await closeAll('Membership库', getMembershipDatabaseClient()?.close);

      console.log('[shutdown] 所有连接已释放，进程退出');
      process.exit(0);
    });

    // 3) 超时强制退出（防止数据库卡死导致进程僵住）
    setTimeout(() => {
      console.error(`[shutdown] 超时（${SHUTDOWN_TIMEOUT_MS}ms），强制退出`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

startServer().catch((error) => {
  console.error('[startup:failed]', error?.message ?? error);
  process.exit(1);
});
