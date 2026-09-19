import type { APIRoute } from "astro";
import {
  memoryStorageProvider,
  createD1StorageProvider,
  getD1Database,
} from "../../../lib/chess/storage";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const envDB = await getD1Database();
    const storage = envDB ? createD1StorageProvider(envDB) : memoryStorageProvider;

    const archives = await storage.getArchivedGames(20);

    return new Response(JSON.stringify({ ok: true, archives }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
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
