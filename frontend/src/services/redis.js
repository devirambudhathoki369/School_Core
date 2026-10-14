import axios from "axios";

const baseURL = process.env.REDIS_URL;
const redisToken = process.env.REDIS_TOKEN;

/**
 * Whether there is anywhere to write to.
 *
 * Production runs without REDIS_URL set. Without this check axios builds a
 * client with `baseURL: undefined`, every relative request rejects with
 * `Invalid URL`, and callers that forget to attach a rejection handler take
 * the Node process down with them.
 *
 * Callers should ask before posting; an unconfigured store is a normal state
 * here, not an error worth reporting.
 */
export function isRedisConfigured() {
    return Boolean(baseURL);
}

const redis = axios.create({
    baseURL,
    headers: {
        Authorization: `Bearer ${redisToken}`,
        "Content-Type": "application/json"
    }
});

export default redis;
