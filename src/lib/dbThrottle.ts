/**
 * Atomic rolling-window counters for Cloudflare D1.
 * Provides race-free rate limiting and quota throttling across Worker isolates.
 */

export interface ThrottleResult {
  allowed: boolean;
  count: number;
  retryAfterSec: number;
}

const UPSERT_THROTTLE_SQL = `
INSERT INTO throttle (bucket, window_start, count) VALUES (?1, ?2, 1)
ON CONFLICT(bucket) DO UPDATE SET
  count        = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE count + 1 END,
  window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END
RETURNING count, window_start;
`.trim();

const CLEANUP_STALE_SQL = `
DELETE FROM throttle WHERE window_start < ?1;
`.trim();

// Track background cleanup per isolate (at most once per hour)
let lastSweepTime = 0;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const STALE_THRESHOLD_SECONDS = 2 * 24 * 60 * 60; // 2 days

export async function sweepStaleThrottleRows(db: App.D1Binding | null | undefined): Promise<void> {
  if (!db || typeof db.prepare !== "function") return;
  const now = Date.now();
  if (now - lastSweepTime < SWEEP_INTERVAL_MS) return;
  lastSweepTime = now;

  try {
    const cutoff = Math.floor(now / 1000) - STALE_THRESHOLD_SECONDS;
    await db.prepare(CLEANUP_STALE_SQL).bind(cutoff).run();
  } catch (err) {
    console.warn("[dbThrottle] Stale row sweep failed soft:", err);
  }
}

/**
 * Consumes one unit from an atomic throttle bucket in D1.
 * Fails soft (returns allowed: true) if D1 is unavailable or errors out,
 * ensuring local development and tests remain deterministic without D1.
 */
export async function consumeThrottle(
  db: App.D1Binding | null | undefined,
  bucket: string,
  max: number,
  windowSeconds: number
): Promise<ThrottleResult> {
  if (!db || typeof db.prepare !== "function") {
    return { allowed: true, count: 1, retryAfterSec: 0 };
  }

  const nowSec = Math.floor(Date.now() / 1000);

  try {
    const row = await db
      .prepare(UPSERT_THROTTLE_SQL)
      .bind(bucket, nowSec, windowSeconds)
      .first<{ count: number; window_start: number }>();

    const count = Number(row?.count) || 1;
    const windowStart = Number(row?.window_start) || nowSec;
    const allowed = count <= max;
    const retryAfterSec = allowed ? 0 : Math.max(1, windowStart + windowSeconds - nowSec);

    // Opportunistically run stale cleanup
    sweepStaleThrottleRows(db).catch(() => {});

    return { allowed, count, retryAfterSec };
  } catch (error) {
    console.warn(`[dbThrottle] Throttle query failed soft for bucket ${bucket}:`, error);
    return { allowed: true, count: 1, retryAfterSec: 0 };
  }
}
