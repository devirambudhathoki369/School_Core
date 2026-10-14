import redis, { isRedisConfigured } from "@/services/redis"

/**
 * Best-effort diagnostics sink.
 *
 * The caller reaches here to report that something ELSE already failed, so this
 * endpoint must never fail in turn — and it must never make the user wait for a
 * write they don't care about.
 *
 * It used to do neither. `redis.post(...)` is async and was not awaited, so the
 * try/catch around it caught nothing: the rejection escaped as an
 * `unhandledRejection` on the Node server, which on Node 15+ is fatal by
 * default. And with REDIS_URL unset in production the axios client has no
 * baseURL, so every single call rejected with `Invalid URL` — including on
 * every logout. The endpoint that reports errors was the one throwing them.
 */
export default function handler(req, res) {
    const { key, payload } = req.body || {};

    // Answer first. Nothing downstream of this is the caller's problem.
    res.status(200).json({});

    if (!key || !isRedisConfigured()) return;

    // `.catch` rather than try/catch: the failure we need to absorb is a
    // rejected promise, which a synchronous catch block cannot see.
    redis
        .post(`/set/${encodeURIComponent(key)}`, payload)
        .catch(() => { /* diagnostics are best-effort by definition */ });
}
