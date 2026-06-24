-- Firasa — Supabase PostgreSQL schema migration
-- Run this once in: Supabase Dashboard → SQL Editor → New query
-- All statements are idempotent (safe to re-run).

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    password_hash  TEXT,
    plan           TEXT NOT NULL DEFAULT 'free',
    created_at     TEXT NOT NULL,
    bio            TEXT,
    phone          TEXT,
    role           TEXT,
    company        TEXT,
    photo          TEXT,
    birth_date     TEXT,
    location       TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified INTEGER NOT NULL DEFAULT 0;

-- ── Sessions (used in local auth mode; unused in Supabase auth mode) ──────────
CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT
);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TEXT;

-- ── Password reset tokens ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);

-- ── Email verification tokens ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_verify_tokens (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
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

-- ── Conversation memory ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_memory (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- ── Resource clicks ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resource_clicks (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL,
    resource_url  TEXT NOT NULL,
    resource_title TEXT NOT NULL,
    gap_category  TEXT,
    clicked_at    TEXT NOT NULL
);

-- ── Milestone outcomes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestone_outcomes (
    id             TEXT PRIMARY KEY,
    project_id     TEXT NOT NULL,
    milestone_id   TEXT NOT NULL,
    milestone_title TEXT NOT NULL,
    trigger        TEXT NOT NULL,
    resource_urls  TEXT NOT NULL,
    resolved       INTEGER NOT NULL DEFAULT 0,
    completed_at   TEXT NOT NULL
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_owner     ON projects(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_audits_owner       ON audits(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_history_pid  ON audit_history(pid);
CREATE INDEX IF NOT EXISTS idx_docs_project       ON project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_conversation_project ON conversation_memory(project_id);
CREATE INDEX IF NOT EXISTS idx_clicks_project       ON resource_clicks(project_id);
