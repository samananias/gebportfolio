import type { APIRoute } from "astro";
import {
  memoryStorageProvider,
  createD1StorageProvider,
  getD1Database,
} from "../../../lib/chess/storage";
import { getClientIp, checkRateLimit } from "../../../lib/rateLimit";

export const prerender = false;

interface CachedArchiveEntry {
  archives: unknown[];
  cachedAt: number;
}

let cachedArchiveState: CachedArchiveEntry | null = null;
const ARCHIVE_CACHE_TTL_MS = 2000;

export function invalidateArchiveCache(): void {
  cachedArchiveState = null;
}

export const GET: APIRoute = async ({ request }) => {
  try {
    // Edge in-memory rate limiting: 30 requests / 60s per IP
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit({
      key: `chess:archive:${clientIp}`,
      maxRequests: 30,
      windowMs: 60_000,
    });

    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          ok: false,
          reason: "rate_limited",
          error: "Too many archive requests. Please slow down.",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil((rateCheck.retryAfterMs || 2000) / 1000)),
          },
        }
      );
    }

    const now = Date.now();
    if (cachedArchiveState && now - cachedArchiveState.cachedAt < ARCHIVE_CACHE_TTL_MS) {
      return new Response(JSON.stringify({ ok: true, archives: cachedArchiveState.archives }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=2",
        },
      });
    }

    const envDB = await getD1Database();
    const storage = envDB ? createD1StorageProvider(envDB) : memoryStorageProvider;

    const archives = await storage.getArchivedGames(20);
    cachedArchiveState = { archives, cachedAt: now };

    return new Response(JSON.stringify({ ok: true, archives }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=2",
      },
    });
  } catch (error) {
    console.error("[API /api/chess/archive Error]:", error);
    return new Response(JSON.stringify({ ok: false, error: "Failed to fetch archived games" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
