# 0012 Chess D1 Query De-amplification & Multiplayer Hardening Specification

<callout icon="♞">**Status:** Approved · **Owner:** Sam & Antigravity · **Date:** 2026-10-12</callout>

---

## 1. Goal & Context

### 1.1 The Incident
In early to mid-October 2026, Cloudflare D1 telemetry for `gebportfolio-db` (`9100d65e-3df5-4256-9c14-3f93831c04fa`) recorded abnormal query volume:
- **October 7 Peak:** An APAC graph bucket at 14:00 GMT+8 recorded approximately **233,000 queries**.
- **October 1–12 Reporting Period Totals:** Approximately **188,908 executions** of two `ALTER TABLE game ADD COLUMN ...` statements, **7,401 executions** of `UPDATE game`, and **1,391 executions** of `INSERT INTO finished_game`.
- **October 12 Active Period:** Approximately **30,000 queries**, **11,000 rows read**, and **742 rows written** over a few hours of development and testing.

### 1.2 Forensic Root Cause: The Runtime DDL Multiplier
Git history analysis proves that `src/lib/chess/storage.ts` retained an identical blob hash (`4658cd89e286311e9eff6ebaf82acae754268883`) across commits `9ecf925` (Oct 3), `fa29d58` (Oct 8), `a27aada` (Oct 8), and `32784ed` (Oct 11).

In all four revisions, [`src/lib/chess/storage.ts`](../../src/lib/chess/storage.ts) executed a runtime auto-schema preamble (`ensureD1Tables`) via `initSchema()`:
```typescript
export function createD1StorageProvider(d1Binding: D1DatabaseBinding): StorageProvider {
  let isInitialized = false;

  const initSchema = async () => {
    if (!isInitialized) {
      await ensureD1Tables(d1Binding);
      isInitialized = true;
    }
  };
```
Because API route handlers (`state.ts`, `move.ts`, `reset.ts`, `archive.ts`) instantiated `createD1StorageProvider(envDB)` freshly inside each request handler, `isInitialized` reset to `false` on every incoming request.

On every execution cycle, `ensureD1Tables` ran:
1. `CREATE TABLE IF NOT EXISTS game (...)`
2. `ALTER TABLE game ADD COLUMN seen_sessions ...` (failed: duplicate column, swallowed by empty catch)
3. `ALTER TABLE game ADD COLUMN all_time_contributors ...` (failed: duplicate column, swallowed by empty catch)
4. `CREATE TABLE IF NOT EXISTS finished_game (...)`
5. `INSERT OR IGNORE INTO game (...)`
6. The actual requested query (`SELECT` or `UPDATE`)

The 188,908 `ALTER TABLE` executions observed in D1 telemetry over October 1–12 match exactly:
$$\frac{188,908\text{ ALTER statements}}{2\text{ ALTER statements per cycle}} \approx 94,454\text{ runtime initialization cycles}$$

### 1.3 Target Objective
1. **Eliminate the runtime DDL multiplier entirely**, dropping single-state reads from 6 queries to 1 query, and moves from 7–8 queries to 2 queries.
2. **Preserve 100% real-time multiplayer consistency across Cloudflare Worker isolates** without introducing desynchronization or stale 304 caching bugs.
3. **Enforce database-level idempotency on finished game archives** to prevent duplicate rows under concurrent move/reset races.
4. **Preserve complete chess rules correctness** (including threefold repetition and fifty-move rules).
5. **Protect production data**: No destructive DDL or table drops. Existing data in `game` and `finished_game` is preserved intact.

---

## 2. User Experience & Design Impact

- **Zero Visual Regression:** No changes to the woodcut manuscript theme, 3D/2D board renderers, standees, piece assets, typography, or modal interfaces.
- **Improved Responsiveness:** Removing 5 unindexed DDL/catalog queries per request drops database transaction contention and eliminates SQLite lock latency.
- **Client Polling Lifecycle:**
  - Active match: client continues steady 5-second polling via `fetchState()`.
  - Concluded match (Checkmate, Stalemate, Draw): client backs off to a relaxed **60-second polling interval** (or pauses until "Start New Match" is clicked). This cuts idle background queries by **91.7%** when users leave tabs open on game-over screens.

---

## 3. Architecture & Component Strategy

### 3.1 Statement Budget Comparison

| API Route | Pre-Fix Statements Executed | Post-Fix Statements Executed | Reduction |
| :--- | :--- | :--- | :--- |
| `GET /api/chess/state` | **6 statements** (5 DDL/seed + 1 `SELECT`) | **1 statement** (`SELECT * FROM game WHERE id = 1`) | **-83.3%** |
| `POST /api/chess/move` (Normal) | **7 statements** (5 DDL/seed + 1 `SELECT` + 1 `UPDATE`) | **2 statements** (1 `SELECT` + 1 `UPDATE`) | **-71.4%** |
| `POST /api/chess/move` (Checkmate) | **8 statements** (5 DDL/seed + 1 `SELECT` + 1 `UPDATE` + 1 `INSERT`) | **3 statements** (1 `SELECT` + 1 `UPDATE` + 1 `INSERT`) | **-62.5%** |
| `POST /api/chess/move` (CAS Conflict) | **8 statements** (5 DDL/seed + 1 `SELECT` + 1 `UPDATE` + 1 `SELECT`) | **3 statements** (1 `SELECT` + 1 `UPDATE` + 1 `SELECT`) | **-62.5%** |
| `POST /api/chess/reset` | **8–9 statements** (5 DDL/seed + 1 `SELECT` + 1 `SELECT` + 0/1 `INSERT` + 1 `UPDATE`) | **3 statements** (1 `SELECT` + 1 `UPDATE` + 0/1 `INSERT`) | **-66.7%** |
| `GET /api/chess/archive` | **6 statements** (5 DDL/seed + 1 `SELECT`) | **1 statement** (`SELECT * FROM finished_game ...`) | **-83.3%** |

---

### 3.2 Component & Module Modifications

#### [MODIFY] `src/lib/chess/storage.ts`
1. Remove `ensureD1Tables` and `initSchema` from the runtime request path completely.
2. In `createD1StorageProvider(d1Binding)`:
   - `getGame()`: Directly executes `SELECT * FROM game WHERE id = 1`.
   - `saveGame(...)`: Directly executes parameterized `UPDATE game SET version=?, fen=?, history=?, position_keys=?, contributors=?, seen_sessions=?, all_time_contributors=?, last_move_at=? WHERE id=1 AND version=?`.
   - `archiveGame(...)`: Directly executes idempotent parameterized query:
     ```sql
     INSERT INTO finished_game (pgn, outcome, contributors, ended_at)
     SELECT ?, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM finished_game WHERE pgn = ?);
     ```
   - `getArchivedGames(...)`: Directly executes `SELECT * FROM finished_game ORDER BY id DESC LIMIT ?`.
3. Eliminate all JavaScript template string interpolation in SQL statements.

#### [MODIFY] `src/pages/api/chess/state.ts`
1. **Multiplayer Cache Safety:** Eliminate the local in-memory isolate cache (`STATE_CACHE_TTL_MS = 0`). Every state read queries D1 directly via the single clean `SELECT`. Because D1 reads are ACID-consistent across edge locations, Player B immediately sees Player A's move without stale 304 responses across separate Worker isolates.
2. **Edge Rate Limiting:** Import and apply `checkRateLimit({ key: 'chess:state:' + clientIp, maxRequests: 60, windowMs: 60_000 })` with generous headroom (60 req/min per IP) to comfortably support multiple legitimate players on the same Wi-Fi connection while blocking runaway scraper loops.
3. **Origin Protection:** Enforce `isOriginAllowed(request)`.
4. **Conditional 304:** Compute ETag `W/"chess-v${game.version}"`. If `clientEtag === etag`, return HTTP 304.

#### [MODIFY] `src/pages/api/chess/reset.ts`
1. Fix contributor double-counting: remove line 147's duplicate `+ (game.contributors > 0 ? 1 : 0)`.
2. Rely on atomic database-level deduplication in `archiveGame()` to prevent duplicate finished game inserts.

#### [MODIFY] `src/lib/chess/outcome.ts`
1. Preserve full move history verification (`fen` + `history`) to uphold chess rule correctness, including threefold repetition and the fifty-move rule.
2. Add guard: if `history.length < 4`, return `null` immediately (no checkmate or draw is possible in fewer than 4 plies).

#### [MODIFY] `src/components/chess/ChessWidget.tsx`
1. In `useEffect` polling interval:
   - If `gameState?.outcome` is non-null (terminal verdict), set interval to **60,000ms** (or pause).
   - When a reset occurs, restore the active **5,000ms** polling interval.

---

## 4. Dependencies & Constraints

- **Zero New Dependencies:** Strictly use existing dependencies (`turn-arbiter`, `chess.js`, Web Crypto, Astro API routes).
- **Zero Production Schema Mutation:** No `DROP TABLE`, `ALTER TABLE`, or destructive migrations.
- **Fail-Closed Security:** Mutating endpoints (`move.ts`, `reset.ts`) retain Turnstile verification, origin checks, and HMAC session cookie verification.
- **Architectural Guidelines:** Follow [Coding Standards](../engineering/CodingStandards.md) and [Security & Bot Defense](../engineering/SecurityAndBotDefense.md).

---

## 5. Verification & Testing Plan

### 5.1 Unit & Budget Verification
- Create mock D1 test asserting:
  - `getGame()` triggers exactly 1 SQL statement.
  - `saveGame()` triggers exactly 1 SQL statement.
  - `archiveGame()` deduplicates identical PGN submissions.

### 5.2 Concurrency & Multiplayer Test Cases
- **Cross-Isolate Sync:** Simulate two providers; verify Player B sees Player A's move on the next read.
- **CAS Move Race:** Simulate two simultaneous moves on the same version; assert one 200 and one 409 (`reason: "superseded"`).
- **Archive Idempotency:** Simulate concurrent resets; verify only 1 finished game row is created.

### 5.3 Full Regression Suite
- `npx pnpm run format`
- `npx pnpm run lint`
- `npx pnpm run check`
- `npx pnpm run check-boundaries`
- `npx pnpm playwright test tests/e2e/chess.spec.ts`
