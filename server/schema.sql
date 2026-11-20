-- IslamQuizz : comptes, classement, groupes et duels par code.
CREATE TABLE IF NOT EXISTS players (
  id         TEXT PRIMARY KEY,
  pseudo     TEXT NOT NULL,
  pseudo_key TEXT NOT NULL UNIQUE,      -- pseudo normalisé, pour l'unicité
  pass_hash  TEXT NOT NULL,             -- PBKDF2-SHA256
  pass_salt  TEXT NOT NULL,
  xp         INTEGER NOT NULL DEFAULT 0,
  games      INTEGER NOT NULL DEFAULT 0,
  week_id    TEXT NOT NULL DEFAULT '',
  week_xp    INTEGER NOT NULL DEFAULT 0,
  day_id     TEXT NOT NULL DEFAULT '',
  day_score  INTEGER NOT NULL DEFAULT 0,
  day_ms     INTEGER NOT NULL DEFAULT 0,
  day_done   INTEGER NOT NULL DEFAULT 0,
  data       TEXT NOT NULL DEFAULT '{}', -- profil complet (missions, série, statistiques)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS players_xp ON players (xp DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,          -- SHA-256 du jeton de connexion
  player_id  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_player ON sessions (player_id);

CREATE TABLE IF NOT EXISTS groups (
  code       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS group_members (
  code      TEXT NOT NULL,
  player_id TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (code, player_id)
);
CREATE INDEX IF NOT EXISTS group_members_player ON group_members (player_id);

CREATE TABLE IF NOT EXISTS duels (
  code       TEXT PRIMARY KEY,
  seed       TEXT NOT NULL,             -- détermine les 10 questions
  a_id       TEXT NOT NULL,
  a_score    INTEGER NOT NULL DEFAULT 0,
  a_ms       INTEGER NOT NULL DEFAULT 0,
  a_done     INTEGER NOT NULL DEFAULT 0,
  b_id       TEXT,
  b_score    INTEGER NOT NULL DEFAULT 0,
  b_ms       INTEGER NOT NULL DEFAULT 0,
  b_done     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS duels_a ON duels (a_id);
CREATE INDEX IF NOT EXISTS duels_b ON duels (b_id);
