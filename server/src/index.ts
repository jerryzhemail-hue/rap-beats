import 'dotenv/config';
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

  app.listen(PORT, () => {
    console.log(`Rap Beats Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
