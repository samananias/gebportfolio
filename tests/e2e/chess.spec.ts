import { test, expect, type Page } from "@playwright/test";

async function openChessModal(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  const dialog = page.getByRole("dialog", { name: "Real-time live chat room" });

  await expect(async () => {
    await page.evaluate(() => {
      (window as unknown as { __portfolio_chat_requested?: boolean }).__portfolio_chat_requested =
        true;
      window.dispatchEvent(new CustomEvent("open-portfolio-chat"));
    });
    await expect(dialog).toBeVisible();
  }).toPass({ timeout: 15_000 });

  // Switch to chess tab if present
  const chessTabBtn = page.getByRole("button", { name: /Shared Chess/i }).first();
  if (await chessTabBtn.isVisible().catch(() => false)) {
    await chessTabBtn.click().catch(() => {});
  }
}

test.describe("Interactive Chess Game Board E2E Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("portfolio_chat_display_name_v1", "ChessTester");
      window.sessionStorage.setItem(
        "portfolio_chat_pass_v1",
        `${Date.now() + 900000}.preview-test-pass`
      );
    });
    await page.goto("/");
  });

  test("should load 3D/2D chess board and render squares", async ({ page }) => {
    await openChessModal(page);

    await expect(async () => {
      const chessSquare = page.locator('button[title="e2"]').first();
      await expect(chessSquare).toBeVisible();
    }).toPass({ timeout: 10000 });
  });

  test("should maintain piece selection and show floating identification label", async ({
    page,
  }) => {
    await openChessModal(page);

    // Determine the player's assigned team from the live game state
    const yourSide = await page.evaluate(async () => {
      const res = await fetch("/api/chess/state");
      const data = await res.json();
      return data.yourSide as "white" | "black";
    });

    const piecePrefix = yourSide === "white" ? "White Pawn" : "Black Pawn";
    const pawnSquare = page.locator(`button[aria-label^="${piecePrefix}"]`).first();
    await expect(pawnSquare).toBeVisible();

    const squareName = await pawnSquare.getAttribute("title");
    expect(squareName).toBeTruthy();

    // Verify piece is selected and retains outline
    await expect(async () => {
      await pawnSquare.click();
      await expect(pawnSquare).toHaveClass(/outline/, { timeout: 1000 });
    }).toPass({ timeout: 10_000 });

    // Verify floating piece label badge appears
    const labelBadge = page.locator(`text=Pawn on ${squareName}`);
    await expect(labelBadge).toBeVisible();
  });

  test("should fetch archive and state endpoints properly", async ({ request }) => {
    const stateRes = await request.get("/api/chess/state");
    expect(stateRes.status()).toBe(200);
    const stateData = await stateRes.json();
    expect(stateData).toHaveProperty("version");
    expect(stateData).toHaveProperty("fen");

    const archiveRes = await request.get("/api/chess/archive");
    expect(archiveRes.status()).toBe(200);
    const archiveData = await archiveRes.json();
    expect(archiveData.ok).toBe(true);
    expect(Array.isArray(archiveData.archives)).toBe(true);
  });

  test("should reject manual reset endpoint while match is in progress", async ({ page }) => {
    // Open home page to establish session cookie
    await page.goto("/");

    const result = await page.evaluate(async () => {
      // Initialize chess session cookie
      await fetch("/api/chess/state");
      const res = await fetch("/api/chess/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    });

    expect(result.status).toBe(400);
    expect(result.data.ok).toBe(false);
    expect(result.data.reason).toBe("game_in_progress");
  });

  test("should render 3D piece standees and maintain interactive selection", async ({ page }) => {
    await openChessModal(page);

    const yourSide = await page.evaluate(async () => {
      const res = await fetch("/api/chess/state");
      const data = await res.json();
      return data.yourSide as "white" | "black";
    });

    const targetSquare = yourSide === "white" ? "e2" : "e7";
    const pieceStandee = page.locator(`div[data-piece-square="${targetSquare}"]`);
    await expect(pieceStandee).toBeVisible();

    const squareBtn = page.locator(`button[title="${targetSquare}"]`);
    await expect(squareBtn).toBeVisible();

    await squareBtn.click();
    await expect(squareBtn).toHaveClass(/outline/);

    const labelBadge = page.locator(`text=Pawn on ${targetSquare}`);
    await expect(labelBadge).toBeVisible();
  });
});
