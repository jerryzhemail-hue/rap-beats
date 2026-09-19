/**
 * server/src/app.ts
 * Express app 导出（不包含 listen），供测试和独立启动复用。
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

export function buildApp() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const app = express();

  // 信任一层反向代理（生产环境 nginx / aliyun slb），让 req.ip 读取 X-Forwarded-For
  // 默认只信任本机回环代理（loopback），避免直接暴露时伪造 X-Forwarded-For 绕过 IP 限流。
  // 生产如需信任 nginx/SLB，显式设置 TRUST_PROXY=1（或具体代理 IP/网段）。
  app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');

  app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static file serving (data/ dir is at server/data)
  const dataDir = path.join(__dirname, '../data');
  app.use('/audio',          express.static(path.join(dataDir, 'audio')));
  app.use('/covers',         express.static(path.join(dataDir, 'covers')));
  app.use('/avatars',        express.static(path.join(dataDir, 'avatars')));
  app.use('/banners',        express.static(path.join(dataDir, 'banners')));
  app.use('/forum-images',   express.static(path.join(dataDir, 'forum-images')));
  app.use('/forum-audio',    express.static(path.join(dataDir, 'forum-audio')));
  app.use('/forum',          express.static(path.join(dataDir, 'forum')));

  return app;
}
