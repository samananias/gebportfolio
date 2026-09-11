import type { APIRoute } from "astro";
import { validateFileMeta, validatePresetId } from "../../../lib/crop/validation";

export const prerender = false;

/**
 * Reserved seam for a future paid server-side removal fallback.
 *
 * v1 always removes backgrounds in the browser (see ADR 0008), so this route
 * validates the submission shape and answers 501 with a machine-readable
 * fallback hint. The deferred frontend codes
 * `tryClient -> catch -> POST /api/crop/remove` once; enabling the fallback
 * later is a single-file change plus a dashboard secret.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "server-removal-not-enabled",
          fallback: "client",
        }),
        { status: 501, headers: { "Content-Type": "application/json" } }
      );
    }

    const form = await request.formData().catch(() => null);
    const presetRaw = form?.get("preset");
    if (validatePresetId(typeof presetRaw === "string" ? presetRaw : null) === null) {
      return new Response(JSON.stringify({ ok: false, error: "A valid photo size is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const file = form?.get("file");
    if (file instanceof File) {
      // Metadata-only validation: bytes are never persisted or forwarded.
      const metaCheck = validateFileMeta({
        mimeType: file.type,
        sizeBytes: file.size,
        widthPx: Number(form?.get("widthPx") ?? NaN),
        heightPx: Number(form?.get("heightPx") ?? NaN),
      });
      if (!metaCheck.isValid) {
        return new Response(JSON.stringify({ ok: false, error: metaCheck.error }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: false,
        error: "server-removal-not-enabled",
        fallback: "client",
      }),
      { status: 501, headers: { "Content-Type": "application/json" } }
    );
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Failed to process removal request." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
