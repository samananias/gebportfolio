-- Migration: 0002_add_throttle_buckets.sql
-- Atomic rolling-window counters for quota protection (contact form caps).

CREATE TABLE IF NOT EXISTS throttle (
  bucket       TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,  -- unix seconds
  count        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_throttle_window ON throttle(window_start);
