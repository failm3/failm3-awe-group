from contextlib import contextmanager
from importlib.resources import files
from pathlib import Path
import hashlib
import psycopg
from psycopg.rows import dict_row
from .config import Settings, ROOT

@contextmanager
def connect(database_url=None):
    conn = psycopg.connect(database_url or Settings.from_env().database_url, row_factory=dict_row, connect_timeout=5)
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def migrate(database_url=None):
    """Transactional forward-only migrations, serialized with a PostgreSQL lock."""
    directory = ROOT / "migrations"
    if not directory.is_dir():
        directory = Path(str(files("awe_ti") / "sql"))
    applied = []
    with connect(database_url) as conn:
        conn.execute("SELECT pg_advisory_xact_lock(824019732)")
        conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())")
        for path in sorted(directory.glob("*.sql")):
            sql = path.read_text(encoding="utf-8")
            checksum = hashlib.sha256(sql.encode()).hexdigest()
            row = conn.execute("SELECT checksum FROM schema_migrations WHERE name=%s", (path.name,)).fetchone()
            if row:
                if row["checksum"] != checksum:
                    raise RuntimeError(f"Migration checksum mismatch: {path.name}")
                continue
            conn.execute(sql)
            conn.execute("INSERT INTO schema_migrations(name,checksum) VALUES (%s,%s)", (path.name, checksum))
            applied.append(path.name)
    return applied
