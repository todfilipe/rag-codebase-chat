export type RateLimit = { limit: number; windowMs: number };

export const QUERY_RATE_LIMIT: RateLimit = { limit: 10, windowMs: 60_000 };
export const INDEX_RATE_LIMIT: RateLimit = { limit: 5, windowMs: 60_000 };

const recentHits = new Map<string, number[]>();

export function takeRateLimit(
  key: string,
  { limit, windowMs }: RateLimit,
  now = Date.now()
): number | null {
  const hits = (recentHits.get(key) ?? []).filter(
    (hitAt) => hitAt > now - windowMs
  );

  if (hits.length >= limit) {
    recentHits.set(key, hits);
    return Math.ceil((hits[0] + windowMs - now) / 1000);
  }

  hits.push(now);
  recentHits.set(key, hits);
  return null;
}

export function rateLimitedResponse(retryAfterSeconds: number): Response {
  return Response.json(
    {
      error: "rate_limited",
      message: `Demasiados pedidos. Tenta outra vez daqui a ${retryAfterSeconds}s.`,
      retry_after_seconds: retryAfterSeconds,
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}
