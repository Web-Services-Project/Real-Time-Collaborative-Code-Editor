// Fixed-window limiter, per client IP. Good enough for a course project;
// a real deployment would back this with Redis so it works across instances.
const { problem } = require('./errors');

const WINDOW_MS = 60_000;
const LIMIT = 60;
const hits = new Map(); // ip -> { count, resetAt }

function rateLimiter(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  let entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    hits.set(ip, entry);
  }
  entry.count += 1;

  const remaining = Math.max(0, LIMIT - entry.count);
  res.set('X-RateLimit-Limit', String(LIMIT));
  res.set('X-RateLimit-Remaining', String(remaining));
  res.set('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

  if (entry.count > LIMIT) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfterSec));
    return problem(res, {
      type: 'rate-limited',
      title: 'Too many requests',
      status: 429,
      detail: `Rate limit exceeded. Retry after ${retryAfterSec}s.`,
    });
  }
  next();
}

module.exports = { rateLimiter };
