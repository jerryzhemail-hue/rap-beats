/**
 * server/src/app.ts
 * Express app 导出（不包含 listen），供测试和独立启动复用。
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

// Security header / body-size 策略
// helmet 默认会打开 X-Content-Type-Options / X-Frame-Options / Strict-Transport-Security 等
// CSP 故意关掉:本项目有 v-html 渲染富文本、图片/音频 CDN、OSS 上传域名,
//   完整 CSP 需要按实际外链白名单 + nonce 调一版,放到下一个迭代
const BODY_JSON_LIMIT = process.env.BODY_JSON_LIMIT || '100kb';
const BODY_URLENCODED_LIMIT = process.env.BODY_URLENCODED_LIMIT || '100kb';

export function buildApp() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const app = express();

  // ─── Security headers（helmet）─────────────────────────────────────
  // 必须放在 cors 之后、所有路由之前,否则响应头会被 cors 覆盖
  app.use(helmet({
    contentSecurityPolicy: false, // 见上方说明,留待下个迭代
    crossOriginEmbedderPolicy: false, // <audio>/<video> 跨域加载 OSS 资源需要
  }));

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

  // CORS:clientUrl 必须已经是合法 https?:// 域(由 config() 校验)
  // 这里只读它,不再次校验;config() 在加载阶段就 fail-fast
  app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  }));

  // Body size 上限:防止恶意大 payload OOM Node 进程
  // - JSON 100kb:覆盖正常业务(签名 license / 用户资料),远大于富文本帖子(单独走 multer)
  // - urlencoded 100kb:覆盖表单提交
  // 富文本帖子 / 图片 / 音频 走 multer 的 multipart,有自己的 limits,不受这里影响
  app.use(express.json({ limit: BODY_JSON_LIMIT }));
  app.use(express.urlencoded({ limit: BODY_URLENCODED_LIMIT, extended: true }));

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
