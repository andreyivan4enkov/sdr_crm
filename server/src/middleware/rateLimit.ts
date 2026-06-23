import { logger } from "../lib/logger.js";

type Bucket = { count: number; reset: number };

const memory = new Map<string, Bucket>();
let lastSweep = Date.now();
const SWEEP_MS = 60_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisClient: any = null;

async function getRedis() {
  if (redisClient !== null) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) {
    redisClient = false;
    return null;
  }
  try {
    const { default: Redis } = await import("ioredis");
    redisClient = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
    await redisClient.connect();
    return redisClient;
  } catch (e) {
    logger.warn("rate_limit.redis.unavailable", { err: e instanceof Error ? e.message : String(e) });
    redisClient = false;
    return null;
  }
}

function sweepMemory(now: number) {
  if (now - lastSweep < SWEEP_MS) return;
  lastSweep = now;
  for (const [k, b] of memory) {
    if (now > b.reset) memory.delete(k);
  }
}

export function rateLimitSync(key: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  sweepMemory(now);
  const b = memory.get(key);
  if (!b || now > b.reset) {
    memory.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}

export function rateLimit(key: string, max = 10, windowMs = 60_000): boolean {
  return rateLimitSync(key, max, windowMs);
}

export async function rateLimitAsync(key: string, max = 10, windowMs = 60_000): Promise<boolean> {
  const redis = await getRedis();
  if (redis) {
    const rk = `rl:${key}`;
    const n = await redis.incr(rk);
    if (n === 1) await redis.pexpire(rk, windowMs);
    return n <= max;
  }
  return rateLimitSync(key, max, windowMs);
}
