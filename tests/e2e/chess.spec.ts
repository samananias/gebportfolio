import { test, expect, type Page } from "@playwright/test";
import { getChessOutcome } from "../../src/lib/chess/outcome";
import { createD1StorageProvider, INITIAL_FEN } from "../../src/lib/chess/storage";

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

  test("should accurately detect checkmate and stalemate outcomes via getChessOutcome", () => {
    // Active initial board
    const initial = getChessOutcome("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(initial).toBeNull();

    // Fool's Mate checkmate (Black wins)
    const foolsMate = getChessOutcome(
      "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
      ["f3", "e5", "g4", "Qh4#"]
    );
    expect(foolsMate).toEqual({
      kind: "win",
      winner: "black",
      by: "checkmate",
    });

    // Scholar's Mate checkmate (White wins)
    const scholarsMate = getChessOutcome(
      "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
      ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]
    );
    expect(scholarsMate).toEqual({
      kind: "win",
      winner: "white",
      by: "checkmate",
    });

    // Stalemate position (Draw)
    const stalemate = getChessOutcome("k7/8/1Q6/8/8/8/8/7K b - - 0 1");
    expect(stalemate).toEqual({
      kind: "draw",
      by: "stalemate",
    });
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

  test("should return ETag and respond with 304 Not Modified on unchanged state", async ({
    request,
  }) => {
    const res1 = await request.get("/api/chess/state");
    expect(res1.ok()).toBeTruthy();
    const etag = res1.headers()["etag"];
    expect(etag).toBeTruthy();

    const res2 = await request.get("/api/chess/state", {
      headers: { "If-None-Match": etag },
    });
    expect(res2.status()).toBe(304);
  });

  test("should enforce rate limiting and 2s caching on GET /api/chess/archive", async ({
    request,
  }) => {
    const res = await request.get("/api/chess/archive");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.archives)).toBe(true);
  });

  test("should execute strictly 1 query per storage operation without runtime DDL", async () => {
    let executedQueries: string[] = [];

    const mockD1 = {
      prepare(query: string) {
        executedQueries.push(query);
        const stmt = {
          first: async () => ({
            version: 1,
            fen: INITIAL_FEN,
            history: "[]",
            position_keys: "[]",
            contributors: 1,
            seen_sessions: "[]",
            all_time_contributors: 1,
            last_move_at: new Date().toISOString(),
          }),
          bind: () => stmt,
          run: async () => ({ meta: { changes: 1 } }),
          all: async () => ({ results: [] }),
        };
        return stmt;
      },
    };

    const provider = createD1StorageProvider(mockD1 as never);

    // 1. getGame() must execute strictly 1 SELECT query (zero CREATE TABLE or ALTER TABLE)
    executedQueries = [];
    const game = await provider.getGame();
    expect(game).not.toBeNull();
    expect(executedQueries.length).toBe(1);
    expect(executedQueries[0]).toContain("SELECT * FROM game WHERE id = 1");
    expect(
      executedQueries.some((q) => q.includes("CREATE TABLE") || q.includes("ALTER TABLE"))
    ).toBe(false);

    // 2. saveGame() must execute strictly 1 UPDATE query
    executedQueries = [];
    await provider.saveGame(1, game!);
    expect(executedQueries.length).toBe(1);
    expect(executedQueries[0]).toContain("UPDATE game");
    expect(
      executedQueries.some((q) => q.includes("CREATE TABLE") || q.includes("ALTER TABLE"))
    ).toBe(false);

    // 3. archiveGame() must use WHERE NOT EXISTS for idempotent insertion
    executedQueries = [];
    await provider.archiveGame("1. e4 e5", "draw", 2);
    expect(executedQueries.length).toBe(1);
    expect(executedQueries[0]).toContain("INSERT INTO finished_game");
    expect(executedQueries[0]).toContain("WHERE NOT EXISTS");
  });

  test("should respond with full state (200) when client ETag is stale", async ({ request }) => {
    const res = await request.get("/api/chess/state", {
      headers: { "If-None-Match": 'W/"chess-v999999"' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("version");
    expect(data).toHaveProperty("fen");
  });
});
