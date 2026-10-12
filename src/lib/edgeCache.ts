/**
 * Safe accessor for Cloudflare Edge Cache API (caches.default).
 * Safely fails soft to null in adapterless Node dev or test environments.
 */

export interface MinimalEdgeCache {
  match(request: Request | string): Promise<Response | undefined>;
  put(request: Request | string, response: Response): Promise<void>;
}

export function getEdgeCache(): MinimalEdgeCache | null {
  try {
    const globalObj = globalThis as unknown as { caches?: { default?: MinimalEdgeCache } };
    if (globalObj.caches && typeof globalObj.caches.default !== "undefined") {
      return globalObj.caches.default;
    }
  } catch {
    // caches API unavailable (Node dev / CI)
  }
  return null;
}
