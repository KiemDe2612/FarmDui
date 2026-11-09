-- Cấu trúc cơ sở dữ liệu D1 cho Dúi Farm. Chạy lại nhiều lần vẫn an toàn.

CREATE TABLE IF NOT EXISTS users (
  username     TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('ADMIN','MANAGER','STAFF','VIEWER')),
  active       INTEGER NOT NULL DEFAULT 1,
  must_change  INTEGER NOT NULL DEFAULT 1,
  salt         TEXT NOT NULL,
  hash         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  username   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (username);

CREATE TABLE IF NOT EXISTS login_attempts (
  username     TEXT PRIMARY KEY,
  fails        INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);

-- Dữ liệu trang trại: mỗi mục cấp cao nhất (animals, pens, incidents...) là một dòng JSON.
CREATE TABLE IF NOT EXISTS farm_data (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO meta (key, value) VALUES ('data_version', 0);
