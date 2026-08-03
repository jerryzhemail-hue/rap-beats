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

// Periodically sweep expired entries to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}, 60_000);

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  keyGenerator?: (req: import('express').Request) => string;
  message?: string;
}) {
  const { windowMs, max, keyGenerator, message = '请求过于频繁，请稍后再试' } = options;

  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    const key = keyGenerator
      ? keyGenerator(req)
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
