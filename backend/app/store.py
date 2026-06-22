"""Contextual project memory (persistence).

Two backends:
  • Local SQLite database — when database is enabled (default)
  • In-memory dicts       — when database is disabled (local testing, no DB needed)
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

_lock = threading.RLock()
_cache: dict[str, ProjectProfile] = {}

# ── Database Driver configuration ─────────────────────────────────────────────
import sqlite3

PLAN_LIMITS = {"free": 1, "plus": 3, "pro": 5}
_DB_ENABLED = settings.database_enabled


# ── In-memory storage (used when DB is disabled) ──────────────────────────────

_mem_users: dict[str, dict] = {}
_mem_sessions: dict[str, dict] = {}
_mem_projects: dict[str, dict] = {}
_mem_audits: dict[str, dict] = {}
_mem_docs: dict[str, dict] = {}


# ── Unified session wrapper ───────────────────────────────────────────────────

class _MemCursor:
    """Fake cursor for in-memory mode — stores the last query + params."""
    def __init__(self):
        self.last_query = ""
        self.last_params = ()
        self._rows = []

    def execute(self, query: str, params: tuple = ()):
        self.last_query = query
        self.last_params = params
        return self

    def fetchone(self):
        return None

    def fetchall(self):
        return []


class _MemSession:
    """Mock DB session that does nothing — real logic is in the store functions."""
    def __init__(self):
        self.cursor = _MemCursor()

    def execute(self, query: str, params: tuple = ()):
        self.cursor.last_query = query
        self.cursor.last_params = params
        return self.cursor


def _get_sqlite_path() -> str:
    db_path = settings.database_url
    if db_path.startswith("sqlite:///"):
        db_path = db_path[10:]
        if db_path.startswith("app/_data/"):
            db_path = str(_STORE_DIR / db_path.replace("app/_data/", ""))
        elif db_path.startswith("backend/_data/"):
            db_path = str(_STORE_DIR / db_path.replace("backend/_data/", ""))
    elif "://" in db_path:
        # Non-sqlite DSN (e.g. leftover postgres/neon URL) — never feed to
        # sqlite3.connect(); fall back to the default local file.
        db_path = ""
    if not db_path:
        db_path = str(_STORE_DIR / "firasa.db")
    return db_path


def _connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(_get_sqlite_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def db_session():
    if _DB_ENABLED:
        _ensure_db()
        conn = None
        try:
            conn = _connect_db()
            yield conn
            conn.commit()
        except Exception as e:
            if conn:
                conn.rollback()
            raise e
        finally:
            if conn:
                conn.close()
    else:
        yield _MemSession()


# ── Schema init (SQLite) ──────────────────────────────────────────────────────

def _init_db_conn(conn) -> None:
    conn.execute("""
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
            vector     TEXT,
            audit_json TEXT NOT NULL,
            audited_at TEXT NOT NULL
        )
    """)
    columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(audits)").fetchall()
    }
    user_columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()
    }
    if "owner_user_id" not in columns:
        conn.execute("ALTER TABLE audits ADD COLUMN owner_user_id TEXT")
    for col in ("bio", "phone", "role", "company", "photo", "birth_date", "location"):
        if col not in user_columns:
            conn.execute(f"ALTER TABLE users ADD COLUMN {col} TEXT")


def _init_docs_table_conn(conn) -> None:
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


def _init_db() -> None:
    # Direct schema init for external entrypoint call
    conn = _connect_db()
    try:
        _init_db_conn(conn)
        conn.commit()
    finally:
        conn.close()


def _init_docs_table() -> None:
    # Direct schema init for external entrypoint call
    conn = _connect_db()
    try:
        _init_docs_table_conn(conn)
        conn.commit()
    finally:
        conn.close()


_db_ready = False


def _ensure_db() -> None:
    global _db_ready
    if _db_ready or not _DB_ENABLED:
        return
    with _lock:
        if _db_ready:
            return
        conn = _connect_db()
        try:
            _init_db_conn(conn)
            _init_docs_table_conn(conn)
            conn.commit()
            _db_ready = True
        finally:
            conn.close()


# ── Auth / session store ──────────────────────────────────────────────────────

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
        "plan": r.get("plan", "free"),
        "created_at": r.get("created_at", ""),
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
    uid = user_id or uuid4().hex
    email_norm = _normalise_email(email)
    user = {
        "id": uid,
        "email": email_norm,
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
        if _DB_ENABLED:
            with db_session() as conn:
                try:
                    conn.execute(
                        """INSERT INTO users (id, email, name, password_hash, plan, created_at,
                           birth_date, location, phone, role, company)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (uid, email_norm, user["name"],
                         _hash_password(password) if password else None,
                         "free", now, birth_date, location, phone, role, company),
                    )
                except Exception as exc:
                    raise ValueError("Email already registered") from exc
        else:
            # In-memory: check for duplicate email
            for u in _mem_users.values():
                if u["email"] == email_norm:
                    raise ValueError("Email already registered")
            user["password_hash"] = _hash_password(password) if password else None
            _mem_users[uid] = user
    return user


def get_or_create_supabase_user(sub: str, email: str, name: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    email_norm = _normalise_email(email) if email else ""
    name_clean = (name or email_norm.split("@")[0] if email_norm else "Entrepreneur").strip()
    with _lock:
        if _DB_ENABLED:
            with db_session() as conn:
                conn.execute(
                    """INSERT INTO users (id, email, name, password_hash, plan, created_at)
                       VALUES (?, ?, ?, NULL, 'free', ?)
                       ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name""",
                    (sub, email_norm, name_clean, now),
                )
                row = conn.execute("SELECT * FROM users WHERE id = ?", (sub,)).fetchone()
            return _user_from_row(row)
        else:
            if sub in _mem_users:
                _mem_users[sub]["email"] = email_norm
                _mem_users[sub]["name"] = name_clean
            else:
                _mem_users[sub] = {
                    "id": sub, "email": email_norm, "name": name_clean,
                    "plan": "free", "created_at": now, "password_hash": None,
                    "bio": None, "phone": None, "role": None, "company": None,
                    "photo": None, "birth_date": None, "location": None,
                }
            return dict(_mem_users[sub])


def authenticate_user(email: str, password: str) -> dict | None:
    email_norm = _normalise_email(email)
    if _DB_ENABLED:
        with db_session() as conn:
            row = conn.execute("SELECT * FROM users WHERE email = ?", (email_norm,)).fetchone()
        if row is None or not _verify_password(password, row["password_hash"]):
            return None
        return _user_from_row(row)
    else:
        for u in _mem_users.values():
            if u["email"] == email_norm:
                if _verify_password(password, u.get("password_hash", "")):
                    return dict(u)
        return None


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc).isoformat()
    with _lock:
        if _DB_ENABLED:
            with db_session() as conn:
                conn.execute(
                    "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
                    (token, user_id, now),
                )
        else:
            _mem_sessions[token] = {"token": token, "user_id": user_id, "created_at": now}
    return token


def get_user_by_id(user_id: str) -> dict | None:
    if _DB_ENABLED:
        with db_session() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return _user_from_row(row)
    else:
        u = _mem_users.get(user_id)
        return dict(u) if u else None


def get_user_by_token(token: str) -> dict | None:
    if _DB_ENABLED:
        with db_session() as conn:
            row = conn.execute(
                """SELECT users.*, sessions.created_at as session_created_at
                   FROM sessions JOIN users ON users.id = sessions.user_id
                   WHERE sessions.token = ?""",
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
    else:
        sess = _mem_sessions.get(token)
        if sess is None:
            return None
        u = _mem_users.get(sess["user_id"])
        return dict(u) if u else None


def delete_session(token: str) -> None:
    with _lock:
        if _DB_ENABLED:
            with db_session() as conn:
                conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        else:
            _mem_sessions.pop(token, None)


def update_user_plan(user_id: str, plan: str) -> dict | None:
    if plan not in PLAN_LIMITS:
        raise ValueError("Unknown plan")
    with _lock:
        if _DB_ENABLED:
            with db_session() as conn:
                conn.execute("UPDATE users SET plan = ? WHERE id = ?", (plan, user_id))
                row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            return _user_from_row(row)
        else:
            u = _mem_users.get(user_id)
            if u:
                u["plan"] = plan
                return dict(u)
        return None


def update_user_profile(
    user_id: str, name: str,
    bio: str | None = None, phone: str | None = None,
    role: str | None = None, company: str | None = None,
    photo: str | None = None, birth_date: str | None = None,
    location: str | None = None,
) -> dict | None:
    with _lock:
        if _DB_ENABLED:
            with db_session() as conn:
                conn.execute(
                    """UPDATE users SET name = ?, bio = ?, phone = ?, role = ?,
                       company = ?, photo = ?, birth_date = ?, location = ?
                       WHERE id = ?""",
                    (name, bio, phone, role, company, photo, birth_date, location, user_id),
                )
                row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            return _user_from_row(row)
        else:
            u = _mem_users.get(user_id)
            if u:
                u.update(name=name, bio=bio, phone=phone, role=role,
                         company=company, photo=photo, birth_date=birth_date, location=location)
                return dict(u)
        return None


# ── ProjectProfile store ──────────────────────────────────────────────────────

def save(profile: ProjectProfile) -> None:
    with _lock:
        _cache[profile.project_id] = profile
        now = profile.created_at.isoformat()
        if _DB_ENABLED:
            with db_session() as conn:
                conn.execute(
                    """INSERT INTO projects (id, owner_user_id, name, language, profile_json, created_at)
                       VALUES (?, ?, ?, ?, ?, ?)
                       ON CONFLICT(id) DO UPDATE SET name = excluded.name,
                       language = excluded.language, profile_json = excluded.profile_json""",
                    (profile.project_id, profile.owner_user_id,
                     profile.name or "Projet", profile.language,
                     profile.model_dump_json(), now),
                )
        else:
            _mem_projects[profile.project_id] = {
                "id": profile.project_id,
                "owner_user_id": profile.owner_user_id,
                "name": profile.name or "Projet",
                "language": profile.language,
                "profile_json": profile.model_dump_json(),
                "created_at": now,
            }


def load(pid: str) -> ProjectProfile | None:
    if pid in _cache:
        return _cache[pid]
    if _DB_ENABLED:
        with db_session() as conn:
            row = conn.execute("SELECT profile_json FROM projects WHERE id = ?", (pid,)).fetchone()
        if row is None:
            return None
        profile = ProjectProfile.model_validate_json(row["profile_json"])
    else:
        entry = _mem_projects.get(pid)
        if entry is None:
            return None
        profile = ProjectProfile.model_validate_json(entry["profile_json"])
    _cache[pid] = profile
    return profile


def count_projects_for_owner(owner_user_id: str) -> int:
    if _DB_ENABLED:
        with db_session() as conn:
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM projects WHERE owner_user_id = ?",
                (owner_user_id,),
            ).fetchone()
        return row["cnt"] if row else 0
    else:
        return sum(1 for p in _mem_projects.values() if p["owner_user_id"] == owner_user_id)


def redact(profile: ProjectProfile, *, is_owner: bool = False) -> dict:
    d = profile.model_dump(mode="json")
    if is_owner:
        return d
    if d.get("commercial", {}).get("value_proposition_narrative"):
        d["commercial"]["value_proposition_narrative"] = "[redacted]"
    if d.get("market", {}).get("estimated_tam_tnd") is not None:
        d["market"]["estimated_tam_tnd"] = 0.0
    if d.get("scalability", {}).get("equipment_cost") is not None:
        d["scalability"]["equipment_cost"] = 0.0
    if d.get("scalability", {}).get("monthly_overhead") is not None:
        d["scalability"]["monthly_overhead"] = 0.0
    if d.get("validation_evidence_narrative") is not None:
        d["validation_evidence_narrative"] = "[redacted]"
    if d.get("key_hires"):
        d["key_hires"] = []
    return d


# ── Audit store ───────────────────────────────────────────────────────────────

def save_audit(
    pid: str, owner_user_id: str | None, name: str | None,
    sector: str | None, stage: int | None,
    vector: list[float] | None, audit_dict: dict,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _lock:
        if _DB_ENABLED:
            with db_session() as conn:
                conn.execute(
                    """INSERT INTO audits (pid, owner_user_id, name, sector, stage, vector, audit_json, audited_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(pid) DO UPDATE SET owner_user_id = excluded.owner_user_id,
                       name = excluded.name, sector = excluded.sector, stage = excluded.stage,
                       vector = excluded.vector, audit_json = excluded.audit_json, audited_at = excluded.audited_at""",
                    (pid, owner_user_id, name, sector, stage,
                     json.dumps(vector) if vector else None,
                     json.dumps(audit_dict), now),
                )
        else:
            _mem_audits[pid] = {
                "pid": pid, "owner_user_id": owner_user_id,
                "name": name, "sector": sector, "stage": stage,
                "vector": vector, "audit_json": audit_dict, "audited_at": now,
            }


def get_audit(pid: str) -> dict | None:
    if _DB_ENABLED:
        with db_session() as conn:
            row = conn.execute("SELECT audit_json FROM audits WHERE pid = ?", (pid,)).fetchone()
        return json.loads(row["audit_json"]) if row else None
    else:
        entry = _mem_audits.get(pid)
        return entry["audit_json"] if entry else None


def list_audits(owner_user_id: str | None = None) -> list[dict]:
    result = []
    seen = set()

    if _DB_ENABLED:
        with db_session() as conn:
            where = "WHERE owner_user_id = ?" if owner_user_id else ""
            params = (owner_user_id,) if owner_user_id else ()
            rows = conn.execute(
                f"""SELECT pid, name, sector, stage, vector, audited_at
                    FROM audits {where} ORDER BY audited_at DESC""",
                params,
            ).fetchall()
        for r in rows:
            seen.add(r["pid"])
            result.append({
                "project_id": r["pid"], "name": r["name"], "sector": r["sector"],
                "stage": r["stage"],
                "vector": json.loads(r["vector"]) if r["vector"] else None,
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
                "project_id": profile.project_id, "name": profile.name,
                "sector": profile.sector.value if profile.sector else None,
                "stage": None, "vector": None,
                "audited_at": profile.created_at.isoformat(),
            })
    else:
        # In-memory: audits first, then unaudited projects
        for pid, a in sorted(_mem_audits.items(), key=lambda x: x[1].get("audited_at", ""), reverse=True):
            if owner_user_id and a.get("owner_user_id") != owner_user_id:
                continue
            seen.add(pid)
            result.append({
                "project_id": pid, "name": a.get("name"), "sector": a.get("sector"),
                "stage": a.get("stage"), "vector": a.get("vector"),
                "audited_at": a.get("audited_at", ""),
            })
        for pid, p in _mem_projects.items():
            if pid in seen:
                continue
            if owner_user_id and p.get("owner_user_id") != owner_user_id:
                continue
            result.append({
                "project_id": pid, "name": p.get("name"),
                "sector": None, "stage": None, "vector": None,
                "audited_at": p.get("created_at", ""),
            })
    result.sort(key=lambda row: row.get("audited_at") or "", reverse=True)
    return result


def delete_project(pid: str) -> bool:
    found = False
    with _lock:
        _cache.pop(pid, None)
        if _DB_ENABLED:
            with db_session() as conn:
                row = conn.execute("SELECT id FROM projects WHERE id = ?", (pid,)).fetchone()
                if row:
                    conn.execute("DELETE FROM projects WHERE id = ?", (pid,))
                    found = True
                conn.execute("DELETE FROM audits WHERE pid = ?", (pid,))
                conn.execute("DELETE FROM project_documents WHERE project_id = ?", (pid,))
        else:
            if pid in _mem_projects:
                del _mem_projects[pid]
                found = True
            _mem_audits.pop(pid, None)
            # Clean up docs
            to_delete = [k for k, d in _mem_docs.items() if d.get("project_id") == pid]
            for k in to_delete:
                del _mem_docs[k]
    return found


# ── Document store ────────────────────────────────────────────────────────────

def save_document(
    doc_id: str, project_id: str, owner_user_id: str,
    filename: str, storage_path: str, extracted_text: str | None,
) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": doc_id, "project_id": project_id, "owner_user_id": owner_user_id,
        "filename": filename, "storage_path": storage_path,
        "extracted_text": extracted_text, "uploaded_at": now,
    }
    with _lock:
        if _DB_ENABLED:
            with db_session() as conn:
                conn.execute(
                    """INSERT INTO project_documents (id, project_id, owner_user_id,
                       filename, storage_path, extracted_text, uploaded_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (doc_id, project_id, owner_user_id, filename, storage_path, extracted_text, now),
                )
        else:
            _mem_docs[doc_id] = doc
    return dict(doc)


def list_documents(project_id: str) -> list[dict]:
    if _DB_ENABLED:
        with db_session() as conn:
            rows = conn.execute(
                """SELECT id, project_id, filename, storage_path, extracted_text, uploaded_at
                   FROM project_documents WHERE project_id = ? ORDER BY uploaded_at DESC""",
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
    else:
        return [
            {
                "id": d["id"], "project_id": d["project_id"], "filename": d["filename"],
                "storage_path": d["storage_path"],
                "extracted_preview": d["extracted_text"][:500] if d.get("extracted_text") else None,
                "uploaded_at": d["uploaded_at"],
            }
            for d in _mem_docs.values() if d["project_id"] == project_id
        ]


def get_documents_text(project_id: str) -> list[dict]:
    """Return full extracted text per document for a project (auto-fill source).
    Unlike list_documents (preview only), this returns the complete text."""
    if _DB_ENABLED:
        with db_session() as conn:
            rows = conn.execute(
                """SELECT filename, extracted_text FROM project_documents
                   WHERE project_id = ? ORDER BY uploaded_at DESC""",
                (project_id,),
            ).fetchall()
        return [{"filename": r["filename"], "text": r["extracted_text"] or ""}
                for r in rows if r["extracted_text"]]
    return [{"filename": d["filename"], "text": d.get("extracted_text") or ""}
            for d in _mem_docs.values()
            if d["project_id"] == project_id and d.get("extracted_text")]


def get_document(doc_id: str) -> dict | None:
    if _DB_ENABLED:
        with db_session() as conn:
            row = conn.execute("SELECT * FROM project_documents WHERE id = ?", (doc_id,)).fetchone()
        return dict(row) if row else None
    else:
        d = _mem_docs.get(doc_id)
        return dict(d) if d else None


def delete_document(doc_id: str) -> None:
    with _lock:
        if _DB_ENABLED:
            with db_session() as conn:
                conn.execute("DELETE FROM project_documents WHERE id = ?", (doc_id,))
        else:
            _mem_docs.pop(doc_id, None)
