/**
 * 服务端配置中心 — 所有 process.env.XXX 读取的统一入口
 *
 * 原则:
 * - 任何模块都不应直接 process.env.X,都从这里取
 * - 启动时校验必要变量(尤其生产环境)
 * - 类型安全的 fallback:DB 通配 / OSS 通配 在缺失时抛错,而不是悄悄用默认值
 *
 * 注意:
 * - 这个文件本身不读取 process.env(留到第一次访问 config.xxx 时)
 *   这样便于测试和脚本场景(比如 migrate 脚本可以单独注入 env)
 * - 配 NODE_ENV=production 时,DB_NAME 禁止默认成 <underscore>dev 后缀
 */

export type StorageDriver = 'local' | 'oss' | 'cos' | 's3';

export interface MainDbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
}

export interface ForumDbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
  /** 是否共用主库(没有设置 FORUM_DB_NAME 时) */
  sharesMainPool: boolean;
}

export interface OssConfig {
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  endpoint?: string;
  stsToken?: string;
  publicBaseUrl?: string;
}

export interface XunhuConfig {
  appId: string;
  appSecret: string;
  gateway: string;
  mockEnabled: boolean;
}

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  isProduction: boolean;
  storage: {
    driver: StorageDriver;
    uploadDir: string;
    ossPrefixes: {
      audio: string;
      cover: string;
      avatar: string;
      banner: string;
      forum_image: string;
      forum_audio: string;
      forum_video: string;
      forum_video_cover: string;
    };
  };
  oss?: OssConfig;
  db: {
    main: MainDbConfig;
    forum: ForumDbConfig;
  };
  auth: {
    jwtSecret: string;
  };
  urls: {
    baseUrl: string;
    clientUrl: string;
  };
  xunhu: XunhuConfig;
  features: {
    vipCacheEnabled: boolean;
    rateLimitDisabled: boolean;
    bpmSidecarUrl: string;
  };
}

// ─── 内部 helper ─────────────────────────────────────────────────────────────

function readEnv(key: string): string | undefined {
  const v = process.env[key];
  return v === '' || v == null ? undefined : v;
}

function readEnvOr(key: string, fallback: string): string {
  return readEnv(key) ?? fallback;
}

function readEnvInt(key: string, fallback: number): number {
  const raw = readEnv(key);
  if (raw == null) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function readEnvBool(key: string, fallback: boolean): boolean {
  const raw = readEnv(key);
  if (raw == null) return fallback;
  return raw === 'true' || raw === '1';
}

function readEnvOrThrow(key: string, context: string): string {
  const v = readEnv(key);
  if (v == null) {
    throw new Error(`Missing required env ${key} (${context})`);
  }
  return v;
}

function detectEnv(): AppConfig['env'] {
  const raw = (readEnv('NODE_ENV') || 'development').toLowerCase();
  if (raw === 'production' || raw === 'test') return raw;
  return 'development';
}

function isProductionLike(env: AppConfig['env']): boolean {
  return env === 'production';
}

// 生产环境禁止的 DB 名后缀(防止误连线上库)
function isProductionForbiddenDb(name: string, env: AppConfig['env']): boolean {
  if (!isProductionLike(env)) return false;
  // 假设生产库名是 rap_beats / rap_beats_forum,本地是 <underscore>dev 后缀
  return name === 'rap_beats' || name === 'rap_beats_forum';
}

// ─── 主配置加载 ──────────────────────────────────────────────────────────────

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  const env = detectEnv();
  const isProduction = isProductionLike(env);

  // ── Storage
  const driverRaw = (readEnv('STORAGE_DRIVER') || 'local').toLowerCase();
  const driver: StorageDriver = (['local', 'oss', 'cos', 's3'] as const).includes(driverRaw as StorageDriver)
    ? (driverRaw as StorageDriver)
    : 'local';

  const storage = {
    driver,
    uploadDir: readEnv('UPLOAD_DIR') || './data/uploads',
    ossPrefixes: {
      audio: readEnv('OSS_AUDIO_PREFIX') || 'audio',
      cover: readEnv('OSS_COVER_PREFIX') || 'covers',
      avatar: readEnv('OSS_AVATAR_PREFIX') || 'avatars',
      banner: readEnv('OSS_BANNER_PREFIX') || 'banners',
      forum_image: readEnv('OSS_FORUM_IMAGE_PREFIX') || 'forum-images',
      forum_audio: readEnv('OSS_FORUM_AUDIO_PREFIX') || 'forum-audio',
      forum_video: readEnv('OSS_FORUM_VIDEO_PREFIX') || 'forum-video',
      forum_video_cover: readEnv('OSS_FORUM_VIDEO_COVER_PREFIX') || 'forum-video-covers',
    },
  };

  let oss: OssConfig | undefined;
  if (driver === 'oss') {
    oss = {
      region: readEnvOrThrow('OSS_REGION', 'OSS storage requires OSS_REGION'),
      bucket: readEnvOrThrow('OSS_BUCKET', 'OSS storage requires OSS_BUCKET'),
      accessKeyId: readEnvOrThrow('OSS_ACCESS_KEY_ID', 'OSS storage requires OSS_ACCESS_KEY_ID'),
      accessKeySecret: readEnvOrThrow('OSS_ACCESS_KEY_SECRET', 'OSS storage requires OSS_ACCESS_KEY_SECRET'),
      endpoint: readEnv('OSS_ENDPOINT'),
      stsToken: readEnv('OSS_STS_TOKEN'),
      publicBaseUrl: readEnv('OSS_PUBLIC_BASE_URL'),
    };
  }

  // ── DB
  const mainDbName = readEnv('DB_NAME') || '';
  const forumDbName = readEnv('FORUM_DB_NAME') || '';

  if (!mainDbName) {
    throw new Error('Missing required env DB_NAME');
  }
  if (isProductionForbiddenDb(mainDbName, env)) {
    // 这里只警告,因为有些场景(从线上库 dump 后做迁移)确实需要它
    console.warn(`[config] WARNING: NODE_ENV=${env} 但 DB_NAME=${mainDbName},请确认这不是误连线上库`);
  }

  const main: MainDbConfig = {
    host: readEnv('DB_HOST') || '127.0.0.1',
    port: readEnvInt('DB_PORT', 3306),
    user: readEnv('DB_USER') || '',
    password: readEnv('DB_PASSWORD') || '',
    database: mainDbName,
    connectionLimit: readEnvInt('DB_POOL_SIZE', 10),
  };

  // Forum DB:没显式设置则与主库共享
  let forum: ForumDbConfig;
  if (!forumDbName) {
    forum = {
      ...main,
      database: mainDbName,
      sharesMainPool: true,
    };
  } else {
    if (isProductionForbiddenDb(forumDbName, env)) {
      console.warn(`[config] WARNING: NODE_ENV=${env} 但 FORUM_DB_NAME=${forumDbName}`);
    }
    forum = {
      host: readEnv('FORUM_DB_HOST') || main.host,
      port: readEnvInt('FORUM_DB_PORT', main.port),
      user: readEnv('FORUM_DB_USER') || main.user,
      password: readEnv('FORUM_DB_PASSWORD') || main.password,
      database: forumDbName,
      connectionLimit: readEnvInt('DB_POOL_SIZE', 10),
      sharesMainPool: false,
    };
  }

  if (!main.user) {
    throw new Error('Missing required env DB_USER');
  }

  // ── Auth
  const jwtSecret = readEnv('JWT_SECRET');
  if (!jwtSecret) {
    if (isProduction) {
      throw new Error('JWT_SECRET is required in production');
    }
    console.warn('[config] WARNING: JWT_SECRET not set, using insecure dev fallback');
  }
  const auth = {
    jwtSecret: jwtSecret || 'dev-insecure-secret-do-not-use-in-prod',
  };

  // ── URLs
  const urls = {
    baseUrl: readEnv('BASE_URL') || 'http://localhost:3000',
    clientUrl: readEnv('CLIENT_URL') || 'http://localhost:5173',
  };

  // ── Xunhu
  const xunhu = {
    appId: readEnv('XUNHU_APPID') || '',
    appSecret: readEnv('XUNHU_APPSECRET') || '',
    gateway: readEnv('XUNHU_GATEWAY') || 'https://api.xunhupay.com/payment/do.html',
    mockEnabled: readEnvBool('MOCK_PAYMENT_ENABLED', false),
  };

  // ── Features
  const features = {
    vipCacheEnabled: readEnvBool('VIP_CACHE_ENABLED', true),
    rateLimitDisabled: readEnvBool('RATE_LIMIT_DISABLED', false),
    bpmSidecarUrl: readEnv('BPM_SIDECAR_URL') || 'http://rap-beats-bpm:5050',
  };

  cached = {
    env,
    isProduction,
    storage,
    oss,
    db: { main, forum },
    auth,
    urls,
    xunhu,
    features,
  };
  return cached;
}

/** 测试/重载用 — 清缓存 */
export function resetConfig(): void {
  cached = null;
}

// ─── 便捷访问器 ──────────────────────────────────────────────────────────────

/** 取配置(懒加载,首次调用时读 env) */
export function config(): AppConfig {
  return loadConfig();
}