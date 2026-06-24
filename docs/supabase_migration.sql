-- Firasa — Supabase PostgreSQL schema migration
-- Run this once in: Supabase Dashboard → SQL Editor → New query
-- All statements are idempotent (safe to re-run).

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT,
    plan          TEXT NOT NULL DEFAULT 'free',
    created_at    TEXT NOT NULL,
    bio           TEXT,
    phone         TEXT,
    role          TEXT,
    company       TEXT,
    photo         TEXT,
    birth_date    TEXT,
    location      TEXT
);

-- ── Sessions (used in local auth mode; unused in Supabase auth mode) ──────────
CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

-- ── Projects ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
    id            TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    language      TEXT NOT NULL DEFAULT 'fr',
    profile_json  TEXT NOT NULL,
    created_at    TEXT NOT NULL
);

-- ── Audits (latest result per project) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audits (
    pid           TEXT PRIMARY KEY,
    owner_user_id TEXT,
    name          TEXT,
    sector        TEXT,
    stage         INTEGER,
    vector        TEXT,
    audit_json    TEXT NOT NULL,
    audited_at    TEXT NOT NULL
);

-- ── Audit history (append-only time series) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_history (
    id            TEXT PRIMARY KEY,
    pid           TEXT NOT NULL,
    owner_user_id TEXT,
    stage         INTEGER,
    vector        TEXT,
    audit_json    TEXT NOT NULL,
    audited_at    TEXT NOT NULL
);

-- ── Project documents ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_documents (
    id             TEXT PRIMARY KEY,
    project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    owner_user_id  TEXT NOT NULL,
    filename       TEXT NOT NULL,
    storage_path   TEXT NOT NULL,
    extracted_text TEXT,
    uploaded_at    TEXT NOT NULL
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_owner     ON projects(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_audits_owner       ON audits(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_history_pid  ON audit_history(pid);
CREATE INDEX IF NOT EXISTS idx_docs_project       ON project_documents(project_id);
