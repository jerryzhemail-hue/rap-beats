/**
 * Simple in-memory sliding-window rate limiter for Express.
 * Keyed by IP + optional route suffix, configured per-route.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, max: 5 })
 *   router.post('/login', limiter, handler)
 */

type RateLimitEntry = {
  count: number;
  resetAt: number; // timestamp when window expires
};

const store = new Map<string, RateLimitEntry>();

// Periodically sweep expired entries to prevent memory leak.
// .unref() 让定时器不阻塞 Node 进程退出（CI/测试时 vitest 才能干净退出）
const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}, 60_000);
sweepTimer.unref();

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  keyGenerator?: (req: import('express').Request) => string;
  message?: string;
}) {
  const { windowMs, max, keyGenerator, message = '请求过于频繁，请稍后再试' } = options;

  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    // 本地开发/自动化测试开关：仅在非生产环境允许 RATE_LIMIT_DISABLED=true
    if (process.env.RATE_LIMIT_DISABLED === 'true') {
      if (process.env.NODE_ENV === 'production') {
        console.error('[rateLimit] ⚠️ RATE_LIMIT_DISABLED 在生产环境被强制忽略');
      } else {
        return next();
      }
    }

    const key = keyGenerator
      ? keyGenerator(req)
      // IP 伪造加固：req.ip 在配置了 trust proxy 后是真实客户端 IP（来自反代 X-Forwarded-For）
      // 注意：必须确保 app.set('trust proxy', ...) 已正确配置（如 trust proxy = 1 或具体 IP/段）
      // 否则攻击者可通过伪造 X-Forwarded-For 头绕过限流
      : `${req.ip ?? 'unknown'}:${req.path}`;

    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      // Start a new window
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message, retry_after: retryAfter });
    }

    entry.count++;
    next();
  };
}

export function ipKeyGenerator(req: import('express').Request): string {
  return req.ip ?? 'unknown';
}

// Legacy factory-style API used by comments.ts and favorites.ts
export function rateLimitMiddleware(
  _action: string,
  limit: number,
  windowMs = 60_000
) {
  return createRateLimiter({ windowMs, max: limit });
}
