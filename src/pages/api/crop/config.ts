import type { APIRoute } from "astro";
import { BG_OPTIONS, EXPORT, ID_PRESETS, REMOVAL_MODEL } from "../../../lib/crop/presets";

export const prerender = false;

/**
 * Canonical ID-photo configuration for the deferred frontend island.
 *
 * The CropStudio island fetches this on load instead of hardcoding sizes,
 * so print specs can only drift in one place (`src/lib/crop/presets.ts`).
 */
export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      presets: ID_PRESETS,
      bgOptions: BG_OPTIONS,
      export: EXPORT,
      model: REMOVAL_MODEL,
      limits: {
        maxInputBytes: EXPORT.maxInputBytes,
        maxInputDimensionPx: EXPORT.maxInputDimensionPx,
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
};
