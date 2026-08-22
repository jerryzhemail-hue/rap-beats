import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { initDatabase, getDatabaseClient, getForumDatabaseClient, getMembershipDatabaseClient, initMySqlDatabaseClientFromEnv } from './database/index.js';
import { initStorage } from './services/storage.js';
import beatsRouter from './routes/beats.js';
import rappersRouter from './routes/rappers.js';
import authRouter from './routes/auth.js';
import uploadRouter from './routes/upload.js';
import favoritesRouter from './routes/favorites.js';
import commentsRouter from './routes/comments.js';
import userRouter from './routes/user.js';
import adminRouter from './routes/admin.js';
import paymentRouter from './routes/payment.js';
import bannersRouter from './routes/banners.js';
import previewRouter from './routes/preview.js';
import forumRouter from './routes/forum.js';
import feedbackRouter from './routes/feedback.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving
initStorage();
app.use('/audio', express.static(path.join(__dirname, '../data/audio')));
app.use('/covers', express.static(path.join(__dirname, '../data/covers')));
app.use('/avatars', express.static(path.join(__dirname, '../data/avatars')));
app.use('/banners', express.static(path.join(__dirname, '../data/banners')));
// 论坛图片和音频分开存储（保留 /forum 兼容旧数据）
app.use('/forum-images', express.static(path.join(__dirname, '../data/forum-images')));
app.use('/forum-audio', express.static(path.join(__dirname, '../data/forum-audio')));
app.use('/forum', express.static(path.join(__dirname, '../data/forum')));

// 健康检查（Docker 健康检查 & 负载均衡探活）
app.get('/api/health', async (_req, res) => {
  const health: {
    status: 'ok' | 'degraded';
    timestamp: string;
    services: Record<string, { status: 'ok' | 'error'; message?: string }>;
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {}
  };

  // 检查数据库连接
  try {
    const db = getDatabaseClient();
    await db.queryOne('SELECT 1');
    health.services.database = { status: 'ok' };
  } catch (err: any) {
    health.status = 'degraded';
    health.services.database = { status: 'error', message: err.message };
  }

  // 检查论坛数据库连接
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

  app.use('/api', beatsRouter);
  app.use('/api/rappers', rappersRouter);
  app.use('/api/auth', authRouter);
  app.use('/api', uploadRouter);
  app.use('/api', favoritesRouter);
  app.use('/api', commentsRouter);
  app.use('/api', userRouter);
  app.use('/api', adminRouter);
  app.use('/api', paymentRouter);
  app.use('/api', bannersRouter);
  app.use('/api', previewRouter);
  app.use('/api', forumRouter);
  app.use('/api', feedbackRouter);

  // Multer 文件校验错误 → 400（必须注册在 500 兜底之前）
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: '文件大小超过限制（最大50MB）' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });

  // 全局错误兜底：所有未捕获的 5xx 错误统一返回通用信息，不暴露内部细节
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
