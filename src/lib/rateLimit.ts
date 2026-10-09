/**
 * Security and Anti-Bot Rate Limiting Utility
 *
 * Provides:
 * 1. IP extraction from Cloudflare and proxy headers
 * 2. Origin / Referer validation to reject external automated scripts (cURL / Python)
 * 3. In-memory token bucket & cooldown rate limiting (zero Cloudflare KV / D1 cost)
 * 4. Server-side sender name filtering against impersonation and bot scripts
 */

import { getWorkersEnv } from "./bindings";

/**
 * Emergency kill switch. Set CHAT_LOCKED=1 in Cloudflare (Settings > Variables)
 * to make /api/chat/send return 503 while a flood is in progress.
 */
export async function isChatLocked(): Promise<boolean> {
  const env = await getWorkersEnv();
  const v = (env?.CHAT_LOCKED ??
    (typeof process !== "undefined" ? process.env?.CHAT_LOCKED : "")) as string | undefined;
  return v === "1" || v === "true";
}

export interface RateLimitOptions {
  key: string;
  maxRequests: number;
  windowMs: number;
  cooldownMs?: number;
  forceEnforce?: boolean;
}

interface MemoryLimitEntry {
  count: number;
  windowStart: number;
  lastRequest: number;
}

const memoryStore = new Map<string, MemoryLimitEntry>();
const MAX_MEMORY_ENTRIES = 2000;

/**
 * Extracts client IP from Cloudflare `cf-connecting-ip` or standard proxy headers.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "127.0.0.1"
  );
}

/**
 * Validates that incoming mutating requests originate from trusted portfolio domains.
 * Drops raw cURL or external cross-site automation in production.
 */
export function isOriginAllowed(request: Request): boolean {
  if (!import.meta.env.PROD || process.env.PLAYWRIGHT_E2E === "1") {
    return true;
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const secFetchSite = request.headers.get("sec-fetch-site");

  if (secFetchSite === "same-origin" || secFetchSite === "same-site") {
    return true;
  }

  const allowedHosts = new Set([
    "samananias.is-a.dev",
    "gebportfolio.pages.dev",
    "gebportfolio.workers.dev",
    "localhost",
    "127.0.0.1",
  ]);

  const host = request.headers.get("host");
  if (host) {
    allowedHosts.add(host);
    allowedHosts.add(host.split(":")[0]);
  }

  if (origin) {
    try {
      const parsed = new URL(origin);
      if (
        allowedHosts.has(parsed.host) ||
        allowedHosts.has(parsed.hostname) ||
        parsed.hostname.endsWith(".gebportfolio.pages.dev") ||
        (host && (parsed.host === host || parsed.hostname === host.split(":")[0]))
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }

  if (referer) {
    try {
      const parsed = new URL(referer);
      if (
        allowedHosts.has(parsed.host) ||
        allowedHosts.has(parsed.hostname) ||
        parsed.hostname.endsWith(".gebportfolio.pages.dev") ||
        (host && (parsed.host === host || parsed.hostname === host.split(":")[0]))
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

const RESERVED_SENDER_PATTERNS = [
  /admin/i,
  /system/i,
  /mod(erator)?/i,
  /owner/i,
  /anthropic/i,
  /claude/i,
  /openai/i,
  /gpt/i,
  /gemini/i,
  /palm/i,
  /phi/i,
  /mistral/i,
  /deepseek/i,
  /llama/i,
  /\bbot\b/i,
  /crawler/i,
  /spider/i,
];

/**
 * Validates chat sender names against length limits and reserved / impersonation tokens.
 */
export function isReservedSender(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 20) {
    return true;
  }
  return RESERVED_SENDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * High-performance in-memory rate limiter running at the edge isolate.
 * Blocks high-frequency loops immediately before incurring Cloudflare KV / D1 write quotas.
 */
export function checkRateLimit(options: RateLimitOptions): {
  allowed: boolean;
  retryAfterMs?: number;
} {
  if (!options.forceEnforce && (!import.meta.env?.PROD || process.env.PLAYWRIGHT_E2E === "1")) {
    return { allowed: true };
  }

  const now = Date.now();
  const { key, maxRequests, windowMs, cooldownMs = 0 } = options;

  if (memoryStore.size > MAX_MEMORY_ENTRIES) {
    for (const [k, v] of memoryStore.entries()) {
      if (now - v.lastRequest > windowMs) {
        memoryStore.delete(k);
      }
    }
  }

  const entry = memoryStore.get(key);

  if (!entry) {
    memoryStore.set(key, {
      count: 1,
      windowStart: now,
      lastRequest: now,
    });
    return { allowed: true };
  }

  if (cooldownMs > 0 && now - entry.lastRequest < cooldownMs) {
    return {
      allowed: false,
      retryAfterMs: cooldownMs - (now - entry.lastRequest),
    };
  }

  if (now - entry.windowStart > windowMs) {
    entry.count = 1;
    entry.windowStart = now;
    entry.lastRequest = now;
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterMs: windowMs - (now - entry.windowStart),
    };
  }

  entry.count += 1;
  entry.lastRequest = now;
  return { allowed: true };
}

/** Clears the in-memory rate limit store (used in test suites). */
export function clearRateLimitStore(): void {
  memoryStore.clear();
}
