interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, TokenBucket>();

const MAX_TOKENS = 20;
const REFILL_RATE = 5; // tokens per second
const REFILL_INTERVAL_MS = 1000;

export function checkRateLimit(shopDomain: string): boolean {
  const now = Date.now();
  let bucket = buckets.get(shopDomain);

  if (!bucket) {
    bucket = { tokens: MAX_TOKENS, lastRefill: now };
    buckets.set(shopDomain, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = Math.floor(elapsed / REFILL_INTERVAL_MS) * REFILL_RATE;
  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  if (bucket.tokens <= 0) {
    return false;
  }

  bucket.tokens--;
  return true;
}

// Clean up stale buckets periodically (every 5 minutes)
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [key, bucket] of buckets) {
    if (bucket.lastRefill < cutoff) {
      buckets.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();
