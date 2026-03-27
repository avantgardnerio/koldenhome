import { isLocalRequest } from "./auth.js";

/**
 * Exponential backoff rate limiter for failed requests.
 * Only penalizes IPs that accumulate HTTP errors (status >= 400).
 * Local requests are never throttled.
 */
export function createRateLimiter({ base = 100, halfLife = 5 * 60 * 1000, cleanupInterval = 10 * 60 * 1000 } = {}) {
  const failures = new Map(); // ip -> { count, lastUpdate }

  // Periodic cleanup of stale entries
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of failures) {
      const elapsed = now - entry.lastUpdate;
      const effective = entry.count * Math.pow(0.5, elapsed / halfLife);
      if (effective < 0.1) failures.delete(ip);
    }
  }, cleanupInterval);
  timer.unref();

  return function rateLimit(req, res, next) {
    if (isLocalRequest(req)) return next();

    const ip = req.ip;
    const entry = failures.get(ip);

    if (entry) {
      const now = Date.now();
      const elapsed = now - entry.lastUpdate;
      const effective = entry.count * Math.pow(0.5, elapsed / halfLife);

      if (effective >= 0.5) {
        const delay = Math.round(base * (Math.pow(2, effective) - 1));
        if (delay > 0) {
          return setTimeout(() => {
            onFinish(res, ip);
            next();
          }, delay);
        }
      }
      // Decayed below threshold — clean up
      if (effective < 0.1) failures.delete(ip);
    }

    onFinish(res, ip);
    next();
  };

  function onFinish(res, ip) {
    res.on("finish", () => {
      if (res.statusCode < 400) return;

      const now = Date.now();
      const entry = failures.get(ip);

      if (entry) {
        const elapsed = now - entry.lastUpdate;
        const decayed = entry.count * Math.pow(0.5, elapsed / halfLife);
        failures.set(ip, { count: decayed + 1, lastUpdate: now });
      } else {
        failures.set(ip, { count: 1, lastUpdate: now });
      }
    });
  }
}
