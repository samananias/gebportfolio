import { test, expect } from "@playwright/test";

test.describe("ID Photo Studio backend contract", () => {
  test("GET /api/crop/config returns canonical presets", async ({ request }) => {
    const response = await request.get("/api/crop/config");
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.presets["2x2"].pixelsAt300Dpi).toEqual([600, 600]);
    expect(body.presets["1x1"].pixelsAt300Dpi).toEqual([300, 300]);
    expect(body.bgOptions).toContain("white");
    expect(body.export.maxInputBytes).toBe(8 * 1024 * 1024);
  });

  test("POST /api/crop/usage accepts metadata-only events", async ({ request }) => {
    const response = await request.post("/api/crop/usage", {
      data: { event: "exported", preset: "2x2", ms: 1234 },
    });
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).ok).toBe(true);
  });

  test("POST /api/crop/usage rejects invalid payloads", async ({ request }) => {
    const response = await request.post("/api/crop/usage", {
      data: { event: "exported", preset: "passport", ms: 1234 },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).ok).toBe(false);
  });

  test("POST /api/crop/remove returns 501 with client fallback", async ({ request }) => {
    const response = await request.post("/api/crop/remove", {
      headers: { "content-type": "application/json" },
      data: {},
    });
    expect(response.status()).toBe(501);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.fallback).toBe("client");
  });
});
