import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

export const authRateLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "1 m"), analytics: true, prefix: "rl:auth" })
  : null;

export const apiRateLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, "1 m"), analytics: true, prefix: "rl:api" })
  : null;

export const sensitiveRateLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "1 m"), analytics: true, prefix: "rl:sensitive" })
  : null;
