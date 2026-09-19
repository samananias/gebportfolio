/// <reference types="astro/client" />

/**
 * Cloudflare bindings contract.
 *
 * Mirrors the bindings declared in `wrangler.jsonc` (plus the Brevo secret,
 * which lives in the Cloudflare dashboard, not in wrangler). The
 * `@astrojs/cloudflare` adapter injects these onto `Astro.locals` per request
 * in production Workers; they are absent under adapterless Node (local dev /
 * CI), where every consumer falls back to in-memory storage.
 *
 * Declaring them here turns silent runtime fallbacks (a misspelled binding
 * name degrading to memory) into compile-time errors. See ADR 0010.
 *
 * The interfaces are deliberately minimal structural shapes — the subset each
 * consumer actually calls — so tests can satisfy them with plain objects.
 */
declare namespace App {
  interface KVBinding {
    get(key: string, type: "json"): Promise<unknown>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  }

  interface D1StatementBinding {
    first<T = Record<string, unknown>>(): Promise<T | null>;
    bind(...values: unknown[]): D1StatementBinding;
    run(): Promise<{ meta: { changes: number } }>;
    all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  }

  interface D1Binding {
    prepare(query: string): D1StatementBinding;
  }

  interface Locals {
    /** Shared chat history + contact/crop rate limiting + inbox archive. */
    CHAT_KV?: KVBinding;
    /** Visitor session KV (declared in wrangler.jsonc; reserved). */
    SESSION?: KVBinding;
    /** Shared chess game state (thin backend, ADR 0008). */
    DB?: D1Binding;
    /** Brevo transactional email secret (dashboard secret, not wrangler). */
    BREVO_API_KEY?: string;
  }
}
