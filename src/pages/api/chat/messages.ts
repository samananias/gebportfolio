import type { APIRoute } from "astro";
import { getWorkersEnv } from "../../../lib/bindings";

export const prerender = false;

export interface ChatMessage {
  id: string;
  sender: string;
  avatar: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

/** Maximum messages kept in the ring buffer. */
export const MAX_CHAT_HISTORY = 50;

/** KV key where the global chat room messages are stored. */
export const CHAT_KV_KEY = "chat:global";

// ---------------------------------------------------------------------------
// In-memory fallback buffer (used during local development without KV)
// ---------------------------------------------------------------------------
let localChatHistory: ChatMessage[] = [
  {
    id: "welcome-1",
    sender: "System",
    avatar: "knight",
    text: "Welcome to the live chat room! Say hello or play a chess move.",
    timestamp: Date.now() - 60000,
    isSystem: true,
  },
];

export interface MinimalKV {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
}

/**
 * Retrieves the KV namespace for the chat room.
 * Resolution order: `locals.CHAT_KV` (test/global override) → the Workers
 * `env` via a lazy `cloudflare:workers` import (resolved natively under
 * workerd in production; fails soft to `null` elsewhere).
 * Returns `null` when running outside Cloudflare (local dev) — callers fall
 * back to the in-memory buffer.
 */
export async function getKVNamespace(locals?: App.Locals): Promise<MinimalKV | null> {
  try {
    const globalObj = globalThis as unknown as Record<string, unknown>;
    const cfEnv = await getWorkersEnv();
    const kv = (locals?.CHAT_KV || globalObj?.CHAT_KV || cfEnv?.CHAT_KV) as MinimalKV | undefined;

    if (kv && typeof kv.get === "function" && typeof kv.put === "function") {
      return kv;
    }
  } catch {
    // KV not available (local dev)
  }
  return null;
}

/**
 * Reads chat history — from KV in production, from the in-memory
 * buffer during local development.
 */
export async function getChatHistory(locals: App.Locals): Promise<ChatMessage[]> {
  const kv = await getKVNamespace(locals);
  if (kv) {
    try {
      const raw = await kv.get(CHAT_KV_KEY, "json");
      if (Array.isArray(raw) && raw.length > 0) {
        return raw as ChatMessage[];
      }
      // Seed KV with initial welcome message if empty
      await kv.put(CHAT_KV_KEY, JSON.stringify(localChatHistory));
      return localChatHistory;
    } catch (e) {
      console.error("[getChatHistory KV Error]:", e);
    }
  }
  return localChatHistory;
}

/**
 * Appends a message to chat history — persists to KV in production,
 * mutates the in-memory buffer during local development.
 */
export async function addChatMessage(locals: App.Locals, msg: ChatMessage): Promise<ChatMessage[]> {
  const kv = await getKVNamespace(locals);
  if (kv) {
    const existing = await getChatHistory(locals);
    const updated = [...existing, msg].slice(-MAX_CHAT_HISTORY);
    await kv.put(CHAT_KV_KEY, JSON.stringify(updated));
    historyCache = null;
    return updated;
  }

  // Local dev fallback
  localChatHistory.push(msg);
  if (localChatHistory.length > MAX_CHAT_HISTORY) {
    localChatHistory = localChatHistory.slice(-MAX_CHAT_HISTORY);
  }
  return localChatHistory;
}

// ---------------------------------------------------------------------------
// Abuse guards (applied before spending a KV write)
// ---------------------------------------------------------------------------
const GLOBAL_MAX_PER_MINUTE = 15; // whole room, all senders
const SAME_SENDER_DUPE_WINDOW_MS = 60_000;
const CROSS_SENDER_DUPE_WINDOW_MS = 10 * 60_000;
const CROSS_SENDER_MIN_KEY_LENGTH = 12; // let short "hi"/"lol" repeat across people

function normalizeForDupe(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Returns true if the message should be silently dropped (not written to KV).
 * Runs against the shared KV history, so it works across isolates (KV is
 * eventually consistent, so the caps are approximate, not exact).
 */
export function shouldDropMessage(history: ChatMessage[], msg: ChatMessage, now = Date.now()) {
  const recent = history.filter((m) => !m.isSystem);
  const key = normalizeForDupe(msg.text);

  if (recent.filter((m) => now - m.timestamp < 60_000).length >= GLOBAL_MAX_PER_MINUTE) {
    return true;
  }
  if (!key) return false;

  for (const m of recent) {
    if (normalizeForDupe(m.text) !== key) continue;
    const age = now - m.timestamp;
    if (m.sender === msg.sender && age < SAME_SENDER_DUPE_WINDOW_MS) return true;
    if (
      m.sender !== msg.sender &&
      key.length >= CROSS_SENDER_MIN_KEY_LENGTH &&
      age < CROSS_SENDER_DUPE_WINDOW_MS
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Guarded append: drops spam silently (the sender still sees success, so bots
 * don't adapt) and costs 0 KV writes when dropped.
 */
export async function addChatMessageGuarded(
  locals: App.Locals,
  msg: ChatMessage
): Promise<{ accepted: boolean; history: ChatMessage[] }> {
  const existing = await getChatHistory(locals);
  if (shouldDropMessage(existing, msg)) {
    return { accepted: false, history: existing };
  }
  const history = await addChatMessage(locals, msg);
  return { accepted: true, history };
}

// Short-lived isolate cache so many polling clients don't each cost a KV read.
let historyCache: { at: number; data: ChatMessage[] } | null = null;
const HISTORY_CACHE_TTL_MS = 3000;

export const GET: APIRoute = async ({ locals }) => {
  const now = Date.now();
  let messages: ChatMessage[];
  if (historyCache && now - historyCache.at < HISTORY_CACHE_TTL_MS) {
    messages = historyCache.data;
  } else {
    messages = await getChatHistory(locals);
    historyCache = { at: now, data: messages };
  }
  return new Response(JSON.stringify({ messages }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Cloudflare-CDN-Cache-Control": "no-store",
    },
  });
};
