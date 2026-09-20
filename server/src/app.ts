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

  // ─── Express trust proxy（影响 req.ip，从而影响基于 IP 的限流 / 防刷）───────────
  // 默认 'loopback'：只信任本机回环代理（127.0.0.1, ::1, 127.0.0.0/8 等），
  // 直连时不会被伪造 X-Forwarded-For 绕过 IP 限流（安全默认值）。
  //
  // 部署在反代后必须调整，详见 DEPLOY.md "Trust Proxy 配置" 一节：
  //   - 单层反代（nginx/SLB 与 server 同机直连）：TRUST_PROXY=1
  //   - 单层反代（跨机）：TRUST_PROXY=<反代 IP 或 CIDR>
  //   - 多层反代（CDN + nginx）：TRUST_PROXY=true
  //   - 直接暴露 3000 端口（不推荐）：保持默认 'loopback'
  //
  // 配错后果：req.ip 永远为 '::ffff:127.0.0.1'，所有用户共享一个限流额度（限流失效）。
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
