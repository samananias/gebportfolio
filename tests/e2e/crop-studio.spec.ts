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

/** Builds a wide two-tone PNG: red on the left half, blue on the right. */
function buildSplitPng(width: number, height: number): Buffer {
  const half = Math.floor(width / 2);
  return buildColoredPng(width, height, (x) =>
    x < half ? [200, 30, 30, 255] : [30, 60, 200, 255]
  );
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

test.describe("ID Photo Studio frontend", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/crop");
    await expect(page.getByRole("heading", { level: 1, name: "ID Photo Studio" })).toBeVisible();
    // Wait for the island to hydrate so the file input's React onChange is live.
    await expect(page.locator("#crop-studio")).toHaveAttribute("data-crop-hydrated", "true");
  });

  test("shows the three-step workbench with empty state", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "01 · Source portrait" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "02 · Frame the face" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "03 · Export print file" })).toBeVisible();
    await expect(page.getByText("No portrait yet. Choose a photo first.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Export 2x2 photo" })).toBeDisabled();
  });

  test("rejects non-image uploads with inline error", async ({ page }) => {
    await expect(page.getByText("Choose a portrait to begin.")).toBeVisible();
    await page.locator("#crop-file").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not a photo"),
    });
    await expect(page.getByRole("alert")).toContainText("Only JPEG and PNG");
  });

  test("loads a portrait and exports a PNG download", async ({ page }) => {
    await expect(page.getByText("Choose a portrait to begin.")).toBeVisible();
    // 64x64 solid red PNG generated inline — guaranteed decodable, no external asset.
    const pngBuffer = buildPng(64, 64, [200, 30, 30, 255]);
    await page.locator("#crop-file").setInputFiles({
      name: "portrait.png",
      mimeType: "image/png",
      buffer: pngBuffer,
    });
    await expect(page.getByText("Portrait loaded.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Export 2x2 photo" })).toBeEnabled();

    // Switch preset and pick transparent background.
    await page.getByRole("radio", { name: /1x1/ }).click();
    await page.getByRole("button", { name: "Export 1x1 photo" }).click();

    const download = page.locator('a[download="id-photo-1x1.png"]');
    await expect(download).toBeVisible();
    const href = await download.getAttribute("href");
    expect(href).toMatch(/^data:image\/png/);
  });

  test("keyboard pan changes the exported framing", async ({ page }) => {
    // Wide two-tone portrait: panning must change which half is sampled.
    const pngBuffer = buildSplitPng(128, 64);
    await page.locator("#crop-file").setInputFiles({
      name: "portrait.png",
      mimeType: "image/png",
      buffer: pngBuffer,
    });
    await expect(page.getByText("Portrait loaded.")).toBeVisible();
    const canvas = page.locator("#crop-studio canvas").first();
    await expect(canvas).toBeVisible();
    await page.getByRole("button", { name: "Export 2x2 photo" }).click();
    const download = page.locator('a[download="id-photo-2x2.png"]');
    await expect(download).toBeVisible();
    const before = await download.getAttribute("href");
    // Pan the photo with the keyboard: the fixed frame samples new pixels.
    await canvas.focus();
    await page.keyboard.press("ArrowRight");
    await page.getByRole("button", { name: "Export 2x2 photo" }).click();
    await expect.poll(async () => download.getAttribute("href")).not.toBe(before);
  });

  test("face guide toggles and never leaks into the export", async ({ page }) => {
    const pngBuffer = buildPng(64, 64, [200, 30, 30, 255]);
    await page.locator("#crop-file").setInputFiles({
      name: "portrait.png",
      mimeType: "image/png",
      buffer: pngBuffer,
    });
    await expect(page.getByText("Portrait loaded.")).toBeVisible();
    const guideToggle = page.getByRole("switch", { name: "Face guide" });
    await expect(guideToggle).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Guide only — it never exports.")).toBeVisible();
    await page.getByRole("button", { name: "Export 2x2 photo" }).click();
    const download = page.locator('a[download="id-photo-2x2.png"]');
    await expect(download).toBeVisible();
    const withGuide = await download.getAttribute("href");
    expect(withGuide).toMatch(/^data:image\/png/);
    await guideToggle.click();
    await expect(guideToggle).toHaveAttribute("aria-checked", "false");
    // Re-export without touching the framing: bytes must be identical.
    await page.getByRole("button", { name: "Export 2x2 photo" }).click();
    const withoutGuide = await download.getAttribute("href");
    expect(withoutGuide).toBe(withGuide);
  });
});
