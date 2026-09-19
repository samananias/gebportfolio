import type { APIRoute } from "astro";
// @ts-expect-error cloudflare:workers virtual module resolved during Cloudflare Workers runtime
import { env as cfEnv } from "cloudflare:workers";

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
 * Retrieves the KV namespace from the Cloudflare runtime context.
 * Resolves from `cloudflare:workers` env or `locals.CHAT_KV`.
 * Returns `null` when running outside Cloudflare (local dev).
 */
export function getKVNamespace(locals?: App.Locals): MinimalKV | null {
  try {
    let targetEnv: Record<string, unknown> | undefined = undefined;
    try {
      if (typeof cfEnv !== "undefined") {
        targetEnv = cfEnv as Record<string, unknown>;
      }
    } catch {
      // cloudflare:workers env unavailable in local dev
    }

    const rawLocals = locals as unknown as Record<string, unknown>;
    const globalObj = globalThis as unknown as Record<string, unknown>;
    const kv = (targetEnv?.CHAT_KV || rawLocals?.CHAT_KV || globalObj?.CHAT_KV) as
      MinimalKV | undefined;

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
  const kv = getKVNamespace(locals);
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
  const kv = getKVNamespace(locals);
  if (kv) {
    const existing = await getChatHistory(locals);
    const updated = [...existing, msg].slice(-MAX_CHAT_HISTORY);
    await kv.put(CHAT_KV_KEY, JSON.stringify(updated));
    return updated;
  }

  // Local dev fallback
  localChatHistory.push(msg);
  if (localChatHistory.length > MAX_CHAT_HISTORY) {
    localChatHistory = localChatHistory.slice(-MAX_CHAT_HISTORY);
  }
  return localChatHistory;
}

export const GET: APIRoute = async ({ locals }) => {
  const messages = await getChatHistory(locals);
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
