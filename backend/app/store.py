"""Contextual project memory (persistence).

Two-layer storage on Neon PostgreSQL:
  • DB — ProjectProfile, stored in projects table.
  • DB — Audit results table for instant history
         retrieval without re-running the LLM pipeline.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .config import settings
from .schema import ProjectProfile

_STORE_DIR = Path(__file__).parent.parent / "_data"
_STORE_DIR.mkdir(exist_ok=True)

_lock = threading.Lock()
_cache: dict[str, ProjectProfile] = {}

# ── Database Driver configuration ─────────────────────────────────────────────
PLAN_LIMITS = {"free": 1, "plus": 3, "pro": 5}

_DB_URL = settings.database_url
if not _DB_URL:
    raise RuntimeError(
        "DATABASE_URL is required. Set it to a Neon PostgreSQL connection string, e.g.:\n"
        "  DATABASE_URL=postgresql://user:password@ep-xxxx.us-east-2.aws.neon.tech/dbname\n"
        "  DATABASE_SSLMODE=require"
    )

try:
    import psycopg2
    import psycopg2.extras
    import psycopg2.pool as _pgpool
except ImportError as exc:
    raise ImportError(
        "psycopg2 is required. Install it with: pip install psycopg2-binary"
    ) from exc

# Connection pool — lazily initialised on first db_session() use.
# Per-process pool (each uvicorn worker gets its own), min=1 max=10 connections.
_pool = None
_POOL_MIN = 1
_POOL_MAX = 10


def _get_pool():
    global _pool
    if _pool is None:
        _pool = _pgpool.ThreadedConnectionPool(
            _POOL_MIN,
            _POOL_MAX,
            _DB_URL,
            cursor_factory=psycopg2.extras.DictCursor,
            sslmode=settings.database_sslmode,
            connect_timeout=5,
        )
    return _pool


@contextmanager
def db_session():
    _ensure_db()
    conn = None
    try:
        conn = _get_pool().getconn()

        class SessionWrapper:
            def __init__(self, c):
                self.conn = c
                self.cursor = c.cursor()

            def execute(self, query: str, params: tuple = ()):
                # psycopg2 uses %s placeholders; our queries use ? for readability
                self.cursor.execute(query.replace("?", "%s"), params)
                return self.cursor

        yield SessionWrapper(conn)
        conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        raise e
    finally:
        if conn:
            _get_pool().putconn(conn)


def _init_db() -> None:
    with db_session() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            TEXT PRIMARY KEY,
                email         TEXT NOT NULL UNIQUE,
                name          TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                plan          TEXT NOT NULL DEFAULT 'free',
                created_at    TEXT NOT NULL,
                bio           TEXT,
                phone         TEXT,
                role          TEXT,
                company       TEXT,
                photo         TEXT,
                birth_date    TEXT,
                location      TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token      TEXT PRIMARY KEY,
                user_id    TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id            TEXT PRIMARY KEY,
                owner_user_id TEXT NOT NULL,
                name          TEXT NOT NULL,
                language      TEXT NOT NULL DEFAULT 'fr',
                profile_json  TEXT NOT NULL,
                created_at    TEXT NOT NULL,
                FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS audits (
                pid        TEXT PRIMARY KEY,
                owner_user_id TEXT,
                name       TEXT,
                sector     TEXT,
                stage      INTEGER,
                vector     TEXT,          -- JSON array [M,C,I,S,G]
                audit_json TEXT NOT NULL,
                audited_at TEXT NOT NULL
            )
        """)

        # Dynamically add any missing columns (migration checks)
        columns = {
            row["column_name"] for row in conn.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'audits'"
            ).fetchall()
        }
        user_columns = {
            row["column_name"] for row in conn.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'"
            ).fetchall()
        }

        if "owner_user_id" not in columns:
            conn.execute("ALTER TABLE audits ADD COLUMN owner_user_id TEXT")

        for col in ("bio", "phone", "role", "company", "photo", "birth_date", "location"):
            if col not in user_columns:
                conn.execute(f"ALTER TABLE users ADD COLUMN {col} TEXT")

        # Make password_hash nullable so managed-auth users can have NULL passwords.
        try:
            conn.execute(
                "ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL"
            )
        except Exception:
            pass  # Column may already be nullable or permission denied


_db_ready = False


def _ensure_db() -> None:
    """Initialise schema lazily — tolerates DB being unreachable at import time."""
    global _db_ready
    if _db_ready:
        return
    with _lock:
        if _db_ready:
            return
        _init_db()
        _init_docs_table()
        _db_ready = True


# Schema initialisation is deferred to first db_session() call — the pool
# connects lazily, so the module can be imported before the DB is reachable.


# Auth/session store
def _normalise_email(email: str) -> str:
    return email.strip().lower()


def _hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000
    ).hex()
    return f"pbkdf2_sha256${salt}${digest}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, expected = stored.split("$", 2)
    except ValueError:
        return False
    candidate = _hash_password(password, salt).split("$", 2)[2]
    return hmac.compare_digest(candidate, expected)


def _user_from_row(row: dict | None) -> dict | None:
    if row is None:
        return None
    r = dict(row)
    return {
        "id": r["id"],
        "email": r["email"],
        "name": r["name"],
        "plan": r["plan"],
        "created_at": r["created_at"],
        "bio": r.get("bio"),
        "phone": r.get("phone"),
        "role": r.get("role"),
        "company": r.get("company"),
        "photo": r.get("photo"),
        "birth_date": r.get("birth_date"),
        "location": r.get("location"),
    }


def create_user(
    email: str,
    password: str,
    name: str | None = None,
    birth_date: str | None = None,
    location: str | None = None,
    phone: str | None = None,
    role: str | None = None,
    company: str | None = None,
    user_id: str | None = None,
) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    user = {
        "id": user_id or uuid4().hex,
        "email": _normalise_email(email),
        "name": (name or email.split("@")[0]).strip(),
        "plan": "free",
        "created_at": now,
        "birth_date": birth_date,
        "location": location,
        "phone": phone,
        "role": role,
        "company": company,
    }
    with _lock:
        with db_session() as conn:
            try:
                conn.execute(
                    """
                    INSERT INTO users (
                        id, email, name, password_hash, plan, created_at,
                        birth_date, location, phone, role, company
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user["id"],
                        user["email"],
                        user["name"],
                        _hash_password(password) if password else None,
                        user["plan"],
                        user["created_at"],
                        user["birth_date"],
                        user["location"],
                        user["phone"],
                        user["role"],
                        user["company"],
                    ),
                )
            except Exception as exc:
                # Standardize database unique constraints violations
                raise ValueError("Email already registered") from exc
    return user


def get_or_create_supabase_user(sub: str, email: str, name: str) -> dict:
    """Upsert a user row keyed by Supabase user UUID.

    If a user with this ID already exists, update their email/name.
    Otherwise create a new row (no password — Supabase manages auth).
    """
    now = datetime.now(timezone.utc).isoformat()
    email = _normalise_email(email) if email else ""
    name = (name or email.split("@")[0] if email else "Entrepreneur").strip()
    with _lock:
        with db_session() as conn:
            conn.execute(
                """
                INSERT INTO users (id, email, name, password_hash, plan, created_at)
                VALUES (?, ?, ?, NULL, 'free', ?)
                ON CONFLICT(id) DO UPDATE SET
                    email = excluded.email,
                    name = excluded.name
                """,
                (sub, email, name, now),
            )
            row = conn.execute("SELECT * FROM users WHERE id = ?", (sub,)).fetchone()
    return _user_from_row(row)


def authenticate_user(email: str, password: str) -> dict | None:
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ?", (_normalise_email(email),)
        ).fetchone()
    if row is None or not _verify_password(password, row["password_hash"]):
        return None
    return _user_from_row(row)


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc).isoformat()
    with _lock:
        with db_session() as conn:
            conn.execute(
                "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
                (token, user_id, now),
            )
    return token


def get_user_by_token(token: str) -> dict | None:
    with db_session() as conn:
        row = conn.execute(
            """
            SELECT users.*, sessions.created_at as session_created_at
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ?
            """,
            (token,),
        ).fetchone()
    if row is None:
        return None

    try:
        created_at = datetime.fromisoformat(row["session_created_at"])
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - created_at
        if age.days > 30:
            delete_session(token)
            return None
    except Exception:
        pass

    return _user_from_row(row)


def delete_session(token: str) -> None:
    with _lock:
        with db_session() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def update_user_plan(user_id: str, plan: str) -> dict | None:
    if plan not in PLAN_LIMITS:
        raise ValueError("Unknown plan")
    with _lock:
        with db_session() as conn:
            conn.execute("UPDATE users SET plan = ? WHERE id = ?", (plan, user_id))
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _user_from_row(row)


def update_user_profile(
    user_id: str,
    name: str,
    bio: str | None = None,
    phone: str | None = None,
    role: str | None = None,
    company: str | None = None,
    photo: str | None = None,
    birth_date: str | None = None,
    location: str | None = None,
) -> dict | None:
    with _lock:
        with db_session() as conn:
            conn.execute(
                """
                UPDATE users
                SET name = ?, bio = ?, phone = ?, role = ?, company = ?, photo = ?,
                    birth_date = ?, location = ?
                WHERE id = ?
                """,
                (name, bio, phone, role, company, photo, birth_date, location, user_id),
            )
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _user_from_row(row)


# ── DB store (ProjectProfile) ─────────────────────────────────────────

def save(profile: ProjectProfile) -> None:
    with _lock:
        _cache[profile.project_id] = profile
        now = profile.created_at.isoformat()
        with db_session() as conn:
            conn.execute(
                """
                INSERT INTO projects (id, owner_user_id, name, language, profile_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    language = excluded.language,
                    profile_json = excluded.profile_json
                """,
                (
                    profile.project_id,
                    profile.owner_user_id,
                    profile.name or "Projet",
                    profile.language,
                    profile.model_dump_json(),
                    now,
                ),
            )


def load(pid: str) -> ProjectProfile | None:
    if pid in _cache:
        return _cache[pid]
    with db_session() as conn:
        row = conn.execute(
            "SELECT profile_json FROM projects WHERE id = ?", (pid,)
        ).fetchone()
    if row is None:
        return None
    profile = ProjectProfile.model_validate_json(row["profile_json"])
    _cache[pid] = profile
    return profile


def list_ids() -> list[str]:
    with db_session() as conn:
        rows = conn.execute("SELECT id FROM projects").fetchall()
    return [r["id"] for r in rows]


def count_projects_for_owner(owner_user_id: str) -> int:
    with db_session() as conn:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM projects WHERE owner_user_id = ?",
            (owner_user_id,),
        ).fetchone()
    return row["cnt"] if row else 0


def redact(profile: ProjectProfile, *, is_owner: bool = False) -> dict:
    d = profile.model_dump(mode="json")
    if is_owner:
        return d  # owner sees full project data
    # Mask project-specific IP / value proposition narrative
    if d.get("commercial", {}).get("value_proposition_narrative"):
        d["commercial"]["value_proposition_narrative"] = "[redacted]"
    # Mask financial indicators
    if d.get("market", {}).get("estimated_tam_tnd") is not None:
        d["market"]["estimated_tam_tnd"] = 0.0
    if d.get("scalability", {}).get("equipment_cost") is not None:
        d["scalability"]["equipment_cost"] = 0.0
    if d.get("scalability", {}).get("monthly_overhead") is not None:
        d["scalability"]["monthly_overhead"] = 0.0
    # Mask newly added sensitive fields
    if d.get("validation_evidence_narrative") is not None:
        d["validation_evidence_narrative"] = "[redacted]"
    if d.get("key_hires"):
        d["key_hires"] = []
    return d


# ── DB store (AuditResult snapshots) ─────────────────────────────────────

def save_audit(
    pid: str,
    owner_user_id: str | None,
    name: str | None,
    sector: str | None,
    stage: int | None,
    vector: list[float] | None,
    audit_dict: dict,
) -> None:
    """Upsert the latest audit result for a project."""
    now = datetime.now(timezone.utc).isoformat()
    with _lock:
        with db_session() as conn:
            conn.execute(
                """
                INSERT INTO audits (pid, owner_user_id, name, sector, stage, vector, audit_json, audited_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(pid) DO UPDATE SET
                    owner_user_id = excluded.owner_user_id,
                    name       = excluded.name,
                    sector     = excluded.sector,
                    stage      = excluded.stage,
                    vector     = excluded.vector,
                    audit_json = excluded.audit_json,
                    audited_at = excluded.audited_at
                """,
                (
                    pid,
                    owner_user_id,
                    name,
                    sector,
                    stage,
                    json.dumps(vector) if vector else None,
                    json.dumps(audit_dict),
                    now,
                ),
            )


def get_audit(pid: str) -> dict | None:
    """Return the last saved audit result dict, or None if not yet audited."""
    with db_session() as conn:
        row = conn.execute(
            "SELECT audit_json FROM audits WHERE pid = ?", (pid,)
        ).fetchone()
    return json.loads(row["audit_json"]) if row else None


def list_audits(owner_user_id: str | None = None) -> list[dict]:
    """Return project summaries, including projects not audited yet."""
    with db_session() as conn:
        where = "WHERE owner_user_id = ?" if owner_user_id else ""
        params = (owner_user_id,) if owner_user_id else ()
        rows = conn.execute(
            f"""
            SELECT pid, name, sector, stage, vector, audited_at
            FROM   audits
            {where}
            ORDER  BY audited_at DESC
            """,
            params,
        ).fetchall()
    result = []
    seen = set()
    for r in rows:
        seen.add(r["pid"])
        result.append({
            "project_id": r["pid"],
            "name":       r["name"],
            "sector":     r["sector"],
            "stage":      r["stage"],
            "vector":     json.loads(r["vector"]) if r["vector"] else None,
            "audited_at": r["audited_at"],
        })

    with db_session() as conn:
        p_rows = conn.execute(
            "SELECT id, owner_user_id, name, profile_json, created_at FROM projects"
        ).fetchall()

    for p_row in p_rows:
        pid = p_row["id"]
        if pid in seen:
            continue
        if owner_user_id and p_row["owner_user_id"] != owner_user_id:
            continue
        profile = ProjectProfile.model_validate_json(p_row["profile_json"])
        result.append({
            "project_id": profile.project_id,
            "name": profile.name,
            "sector": profile.sector.value if profile.sector else None,
            "stage": None,
            "vector": None,
            "audited_at": profile.created_at.isoformat(),
        })
    result.sort(key=lambda row: row.get("audited_at") or "", reverse=True)
    return result


def delete_project(pid: str) -> bool:
    """Delete project profile (DB) and audit snapshot (DB). Returns True if found."""
    found = False
    with _lock:
        _cache.pop(pid, None)
        with db_session() as conn:
            row = conn.execute("SELECT id FROM projects WHERE id = ?", (pid,)).fetchone()
            if row:
                conn.execute("DELETE FROM projects WHERE id = ?", (pid,))
                found = True
            conn.execute("DELETE FROM audits WHERE pid = ?", (pid,))
            conn.execute("DELETE FROM project_documents WHERE project_id = ?", (pid,))
    return found


# ── Document store (uploaded evidence) ────────────────────────────────────────

def _init_docs_table() -> None:
    with db_session() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS project_documents (
                id            TEXT PRIMARY KEY,
                project_id    TEXT NOT NULL,
                owner_user_id TEXT NOT NULL,
                filename      TEXT NOT NULL,
                storage_path  TEXT NOT NULL,
                extracted_text TEXT,
                uploaded_at   TEXT NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
        """)




def save_document(
    doc_id: str,
    project_id: str,
    owner_user_id: str,
    filename: str,
    storage_path: str,
    extracted_text: str | None,
) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    with _lock:
        with db_session() as conn:
            conn.execute(
                """
                INSERT INTO project_documents (id, project_id, owner_user_id, filename, storage_path, extracted_text, uploaded_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (doc_id, project_id, owner_user_id, filename, storage_path, extracted_text, now),
            )
    return {
        "id": doc_id, "project_id": project_id, "filename": filename,
        "storage_path": storage_path, "extracted_text": extracted_text,
        "uploaded_at": now,
    }


def list_documents(project_id: str) -> list[dict]:
    with db_session() as conn:
        rows = conn.execute(
            "SELECT id, project_id, filename, storage_path, extracted_text, uploaded_at "
            "FROM project_documents WHERE project_id = ? ORDER BY uploaded_at DESC",
            (project_id,),
        ).fetchall()
    return [
        {
            "id": r["id"], "project_id": r["project_id"], "filename": r["filename"],
            "storage_path": r["storage_path"],
            "extracted_preview": r["extracted_text"][:500] if r["extracted_text"] else None,
            "uploaded_at": r["uploaded_at"],
        }
        for r in rows
    ]


def get_document(doc_id: str) -> dict | None:
    with db_session() as conn:
        row = conn.execute(
            "SELECT * FROM project_documents WHERE id = ?", (doc_id,)
        ).fetchone()
    if row is None:
        return None
    return dict(row)


def delete_document(doc_id: str) -> None:
    with _lock:
        with db_session() as conn:
            conn.execute("DELETE FROM project_documents WHERE id = ?", (doc_id,))
