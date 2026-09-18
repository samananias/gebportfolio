import { test, expect } from "@playwright/test";
import zlib from "zlib";

/** Builds a valid RGBA PNG of the given size, filled with one solid color. */
function buildPng(
  width: number,
  height: number,
  [r, g, b, a]: [number, number, number, number]
): Buffer {
  return buildColoredPng(width, height, () => [r, g, b, a] as [number, number, number, number]);
}

/** Builds a PNG with a 4x4 checkerboard of as transparent / 255 opaque. */
function buildCutoutPng(width: number, height: number): Buffer {
  const cell = 4;
  return buildColoredPng(width, height, (x, y) => {
    const light = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
    return light ? [200, 30, 30, 255] : [210, 40, 40, 0];
  });
}

function buildColoredPng(
  width: number,
  height: number,
  pick: (x: number, y: number) => [number, number, number, number]
): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0; // filter type none
    for (let x = 0; x < width; x++) {
      const p = row + 1 + x * 4;
      const [r, g, b, a] = pick(x, y);
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = a;
    }
  }
  const idat = zlib.deflateSync(raw);
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    let crc = 0xffffffff;
    const all = Buffer.concat([typeBuf, data]);
    for (const byte of all) {
      crc ^= byte;
      for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  };
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test.describe("Remove Background page", () => {
  test.beforeEach(async ({ page }) => {
    // Mock the model provider (the real WASM/ONNX bundle is ~40MB) with a
    // tiny alpha-checkerboard PNG so CI never downloads the model. Only
    // absolute external fetches are mocked; same-origin blobs and app
    // routes pass through untouched. (ADR 0008: the client fetches the
    // model from a CDN at first run.)
    const cutout = buildCutoutPng(64, 64);
    // Only the model CDN is mocked — never the app origin, so navigation
    // and blob fetches pass through untouched.
    await page.route(
      /^https?:\/\/(?!localhost)/,
      (route) =>
        void route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          body: cutout,
        })
    );
    await page.goto("/remove-background");
    await expect(page.getByRole("heading", { level: 1, name: "Remove Background" })).toBeVisible();
    await expect(page.locator("#remove-studio")).toHaveAttribute("data-remove-hydrated", "true");
  });

  test("shows the removal-only workbench with no crop controls", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "01 · Source photo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "02 · Compare" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "03 · Remove & export" })).toBeVisible();
    await expect(page.getByText("No photo yet. Choose a photo first.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove background" })).toBeDisabled();
    // Feature 3: absolutely no crop UI on this page.
    await expect(page.locator("#crop-studio")).toHaveCount(0);
    await expect(page.locator("#crop-studio canvas")).toHaveCount(0);
    await expect(page.locator("#crop-guide")).toHaveCount(0);
    await expect(page.getByRole("radiogroup")).toHaveCount(0);
  });

  test("removal failure is non-fatal and keeps the original usable", async ({ page }) => {
    // The mocked model provider returns synthetic bytes (not a real
    // resources.json manifest), so the removal library fails exactly as
    // it would on a model/network stall. The page must degrade
    // gracefully: clear error, original still visible, no crash.
    const pngBuffer = buildPng(32, 32, [200, 30, 30, 255]);
    await page.locator("#remove-file").setInputFiles({
      name: "portrait.png",
      mimeType: "image/png",
      buffer: pngBuffer,
    });
    await expect(page.getByText("Photo loaded.")).toBeVisible();

    await page.getByRole("button", { name: "Remove background" }).click();
    await expect(page.getByRole("alert")).toContainText("Background removal failed");
    await expect(page.getByRole("button", { name: "Remove background" })).toBeEnabled();
    // The original is still displayed and usable; exports stay disabled
    // until a real cutout exists.
    await expect(page.locator("#remove-studio img").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Prepare download" })).toBeDisabled();
  });

  test("rejects non-image uploads with inline error", async ({ page }) => {
    await page.locator("#remove-file").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not a photo"),
    });
    await expect(page.getByRole("alert")).toContainText("Only JPEG and PNG");
  });
});
