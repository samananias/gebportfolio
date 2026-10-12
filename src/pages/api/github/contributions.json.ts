import type { APIRoute } from "astro";
import { getClientIp, checkRateLimit } from "../../../lib/rateLimit";
import { getEdgeCache } from "../../../lib/edgeCache";

export const prerender = false;

export interface ContributionDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface ContributionsPayload {
  totalContributions: number;
  days: ContributionDay[];
  /**
   * Timestamp when the contribution data was fetched from upstream and populated into cache.
   * Cached responses return the cache creation time rather than request time.
   */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Layer 1: Isolate-level in-memory cache (60 seconds)
// ---------------------------------------------------------------------------
let memoryCache: { at: number; data: ContributionsPayload } | null = null;
const MEMORY_CACHE_TTL_MS = 60_000;

const CACHE_CONTROL_HEADER = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

function createJsonResponse(
  data: ContributionsPayload | { error: string },
  status = 200,
  cacheHeaderStatus?: "HIT-MEMORY" | "HIT-EDGE" | "MISS"
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (status === 200) {
    headers["Cache-Control"] = CACHE_CONTROL_HEADER;
  }

  if (cacheHeaderStatus) {
    headers["X-Cache"] = cacheHeaderStatus;
  }

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

export const GET: APIRoute = async ({ request }) => {
  // 1. Edge rate limiting (cheap in-memory guard before cache or upstream parsing)
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit({
    key: `github:contrib:${clientIp}`,
    maxRequests: 30,
    windowMs: 60_000,
    forceEnforce: true,
  });

  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil((rateLimit.retryAfterMs || 1000) / 1000)),
      },
    });
  }

  const now = Date.now();

  // 2. Cache Tier 1: In-memory isolate cache
  if (memoryCache && now - memoryCache.at < MEMORY_CACHE_TTL_MS) {
    return createJsonResponse(memoryCache.data, 200, "HIT-MEMORY");
  }

  // 3. Cache Tier 2: Cloudflare Edge Cache API (caches.default)
  const edgeCache = getEdgeCache();
  if (edgeCache) {
    try {
      const match = await edgeCache.match(request.url);
      if (match) {
        const cachedJson = (await match.json()) as ContributionsPayload;
        if (cachedJson && Array.isArray(cachedJson.days) && cachedJson.days.length > 0) {
          memoryCache = { at: now, data: cachedJson };
          return createJsonResponse(cachedJson, 200, "HIT-EDGE");
        }
      }
    } catch {
      // Edge cache lookup failure falls soft to upstream fetch
    }
  }

  // 4. Live fetch & parse from upstream GitHub
  try {
    const username = "SamAnaniasCases";
    const res = await fetch(`https://github.com/users/${username}/contributions`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PortfolioBot/1.0)",
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: "Failed to fetch contributions from GitHub",
          days: [],
          totalContributions: 488,
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const html = await res.text();

    const totalMatch = html.match(/([\d,]+)\s+contributions\s+in the last year/i);
    const parsedTotal = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ""), 10) : 488;
    const totalContributions = Math.max(488, parsedTotal);

    const tooltipRegex = /<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]+)<\/tool-tip>/g;
    const tooltipMap = new Map<string, string>();
    let tMatch;
    while ((tMatch = tooltipRegex.exec(html)) !== null) {
      tooltipMap.set(tMatch[1], tMatch[2]);
    }

    const regex = /<td[^>]*data-date="([^"]+)"[^>]*data-level="([^"]+)"[^>]*>/g;
    const tdIdRegex = /id="([^"]+)"/;
    const days: ContributionDay[] = [];
    let match;

    while ((match = regex.exec(html)) !== null) {
      const date = match[1];
      const level = Math.min(4, Math.max(0, parseInt(match[2], 10))) as 0 | 1 | 2 | 3 | 4;
      const fullTd = match[0];
      const idMatch = tdIdRegex.exec(fullTd);
      let count = level > 0 ? 1 : 0;

      if (idMatch && tooltipMap.has(idMatch[1])) {
        const text = tooltipMap.get(idMatch[1]) || "";
        const cMatch = text.match(/^([\d,]+)\s+contribution/);
        if (cMatch) {
          count = parseInt(cMatch[1].replace(/,/g, ""), 10);
        }
      }
      days.push({ date, level, count });
    }

    days.sort((a, b) => a.date.localeCompare(b.date));

    const payload: ContributionsPayload = {
      totalContributions,
      days,
      updatedAt: new Date().toISOString(),
    };

    // Store in isolate memory cache
    memoryCache = { at: now, data: payload };

    // Store in Cloudflare Edge Cache API
    if (edgeCache) {
      try {
        const responseToCache = new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": CACHE_CONTROL_HEADER,
            "Access-Control-Allow-Origin": "*",
          },
        });
        await edgeCache.put(request.url, responseToCache);
      } catch (cacheErr) {
        console.warn("[EdgeCache Put Warning]:", cacheErr);
      }
    }

    return createJsonResponse(payload, 200, "MISS");
  } catch (e) {
    console.error("[API GitHub Contributions Error]:", e);
    return new Response(
      JSON.stringify({
        error: "Internal server error fetching GitHub contributions",
        days: [],
        totalContributions: 488,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
