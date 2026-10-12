-- Migration: 0001_init_chess_tables.sql
-- Cloudflare D1 Database Schema for Shared Crowd Chess Game
-- Singleton game row guarantees structurally that only one live board exists at any time.

CREATE TABLE IF NOT EXISTS game (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  version               INTEGER NOT NULL,
  fen                   TEXT    NOT NULL,
  history               TEXT    NOT NULL,  -- JSON array of SAN notation strings
  position_keys         TEXT    NOT NULL,  -- JSON array of position keys for threefold repetition
  contributors          INTEGER NOT NULL,
  seen_sessions         TEXT    NOT NULL DEFAULT '[]',
  all_time_contributors INTEGER NOT NULL DEFAULT 0,
  last_move_at          TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS finished_game (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pgn          TEXT    NOT NULL,
  outcome      TEXT    NOT NULL,
  contributors INTEGER NOT NULL,
  ended_at     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limit (
  ip         TEXT PRIMARY KEY,
  tokens     REAL NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO game (id, version, fen, history, position_keys, contributors, seen_sessions, all_time_contributors, last_move_at)
VALUES (1, 0, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', '[]', '["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"]', 0, '[]', 0, '2026-10-12T00:00:00.000Z');
