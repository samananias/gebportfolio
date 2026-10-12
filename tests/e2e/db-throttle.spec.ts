import { test, expect } from "@playwright/test";
import { consumeThrottle } from "../../src/lib/dbThrottle";

test.describe("Atomic D1 dbThrottle", () => {
  test("fails soft when D1 database binding is null or undefined", async () => {
    const resNull = await consumeThrottle(null, "contact:test:1", 3, 3600);
    expect(resNull.allowed).toBe(true);
    expect(resNull.count).toBe(1);
    expect(resNull.retryAfterSec).toBe(0);

    const resUndefined = await consumeThrottle(undefined, "contact:test:2", 3, 3600);
    expect(resUndefined.allowed).toBe(true);
    expect(resUndefined.count).toBe(1);
    expect(resUndefined.retryAfterSec).toBe(0);
  });

  test("accurately counts and enforces limits using simulated D1 prepared statements", async () => {
    // In-memory mock implementing App.D1Binding contract with SQLite RETURNING logic
    const store = new Map<string, { window_start: number; count: number }>();

    const mockDb: App.D1Binding = {
      prepare(query: string) {
        let boundParams: unknown[] = [];
        return {
          bind(...values: unknown[]) {
            boundParams = values;
            return this;
          },
          async first<T = Record<string, unknown>>(): Promise<T | null> {
            if (query.includes("INSERT INTO throttle")) {
              const bucket = boundParams[0] as string;
              const nowSec = boundParams[1] as number;
              const windowSeconds = boundParams[2] as number;

              let entry = store.get(bucket);
              if (!entry) {
                entry = { window_start: nowSec, count: 1 };
              } else {
                if (nowSec - entry.window_start >= windowSeconds) {
                  entry = { window_start: nowSec, count: 1 };
                } else {
                  entry = { window_start: entry.window_start, count: entry.count + 1 };
                }
              }
              store.set(bucket, entry);
              return { count: entry.count, window_start: entry.window_start } as unknown as T;
            }
            return null;
          },
          async run() {
            return { meta: { changes: 1 } };
          },
          async all<T = Record<string, unknown>>() {
            return { results: [] as T[] };
          },
        };
      },
    };

    const bucket = "contact:ip:198.51.100.1";
    const max = 3;
    const windowSeconds = 3600;

    // 1st request -> allowed (count: 1)
    const res1 = await consumeThrottle(mockDb, bucket, max, windowSeconds);
    expect(res1.allowed).toBe(true);
    expect(res1.count).toBe(1);
    expect(res1.retryAfterSec).toBe(0);

    // 2nd request -> allowed (count: 2)
    const res2 = await consumeThrottle(mockDb, bucket, max, windowSeconds);
    expect(res2.allowed).toBe(true);
    expect(res2.count).toBe(2);
    expect(res2.retryAfterSec).toBe(0);

    // 3rd request -> allowed (count: 3)
    const res3 = await consumeThrottle(mockDb, bucket, max, windowSeconds);
    expect(res3.allowed).toBe(true);
    expect(res3.count).toBe(3);
    expect(res3.retryAfterSec).toBe(0);

    // 4th request -> blocked (count: 4)
    const res4 = await consumeThrottle(mockDb, bucket, max, windowSeconds);
    expect(res4.allowed).toBe(false);
    expect(res4.count).toBe(4);
    expect(res4.retryAfterSec).toBeGreaterThan(0);
    expect(res4.retryAfterSec).toBeLessThanOrEqual(3600);
  });
});
