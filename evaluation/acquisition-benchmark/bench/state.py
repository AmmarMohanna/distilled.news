"""Durable local job ledger, single-dispatch locking and conservative spend reservations."""
from __future__ import annotations

from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import time
import uuid

from bench.config import canonical, identifier


class State:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.root / "benchmark.sqlite", timeout=30, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.executescript('''
            CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, manifest TEXT NOT NULL, stopped INTEGER NOT NULL DEFAULT 0, created REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, run TEXT NOT NULL, spec TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planned', result TEXT, remote TEXT, started REAL, finished REAL);
            CREATE TABLE IF NOT EXISTS spend(job TEXT PRIMARY KEY, provider TEXT NOT NULL, reserved REAL NOT NULL, actual REAL, note TEXT);
            CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, run TEXT, job TEXT, at REAL, kind TEXT, detail TEXT);
            CREATE TABLE IF NOT EXISTS heartbeat(run TEXT PRIMARY KEY, at REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS source_state(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        ''')

    def close(self): self.db.close()

    @contextmanager
    def transaction(self):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            yield
            self.db.execute("COMMIT")
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    @contextmanager
    def dispatch_lock(self, name="dispatch"):
        """OS lock auto-releases after process exit; all runs in this data root share it."""
        path = self.root / f"{identifier(name)}.lock"
        with path.open("a+b") as stream:
            if path.stat().st_size == 0: stream.write(b"0"); stream.flush()
            stream.seek(0)
            try:
                if os.name == "nt":
                    import msvcrt
                    msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as error:
                raise RuntimeError("A dispatcher already owns this data directory") from error
            try: yield
            finally:
                stream.seek(0)
                if os.name == "nt":
                    msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
                else: fcntl.flock(stream, fcntl.LOCK_UN)

    def create_run(self, run_id: str, manifest: dict, jobs: list[dict]):
        identifier(run_id)
        with self.transaction():
            self.db.execute("INSERT INTO runs(id,manifest,created) VALUES(?,?,?)", (run_id, canonical(manifest), time.time()))
            for index, job in enumerate(jobs):
                self.db.execute("INSERT INTO jobs(id,run,spec) VALUES(?,?,?)", (f"{run_id}-{index:06}", run_id, canonical(job)))

    def manifest(self, run):
        row = self.db.execute("SELECT manifest FROM runs WHERE id=?", (run,)).fetchone()
        if row is None: raise ValueError("Unknown run")
        return json.loads(row[0])

    def jobs(self, run):
        return [dict(row) | {"spec": json.loads(row["spec"]), "result": json.loads(row["result"]) if row["result"] else None,
                              "remote": json.loads(row["remote"]) if row["remote"] else None}
                for row in self.db.execute("SELECT * FROM jobs WHERE run=? ORDER BY id", (run,))]

    def stop(self, run, stopped=True):
        self.manifest(run)
        self.db.execute("UPDATE runs SET stopped=? WHERE id=?", (int(stopped), run))

    def stopped(self, run):
        return bool(self.db.execute("SELECT stopped FROM runs WHERE id=?", (run,)).fetchone()[0])

    def reserve(self, job: str, provider: str, maximum: float, budget: dict) -> bool:
        if maximum < 0 or not __import__('math').isfinite(maximum): raise ValueError("Invalid reservation")
        with self.transaction():
            if self.db.execute("SELECT 1 FROM spend WHERE job=?", (job,)).fetchone(): return True
            total = self.db.execute("SELECT COALESCE(SUM(COALESCE(actual,reserved)),0) FROM spend").fetchone()[0]
            used = self.db.execute("SELECT COALESCE(SUM(COALESCE(actual,reserved)),0) FROM spend WHERE provider=?", (provider,)).fetchone()[0]
            if maximum and (total + maximum > budget.get("total_usd", 0) + 1e-9 or
                            used + maximum > budget.get("providers", {}).get(provider, 0) + 1e-9): return False
            self.db.execute("INSERT INTO spend(job,provider,reserved) VALUES(?,?,?)", (job, provider, maximum))
            return True

    def reconcile(self, job: str, actual: float, note: str):
        if actual < 0 or not __import__('math').isfinite(actual): raise ValueError("Invalid actual cost")
        if not note.strip(): raise ValueError("Supply billing evidence/reference")
        with self.transaction():
            row = self.db.execute("SELECT reserved FROM spend WHERE job=?", (job,)).fetchone()
            if row is None: raise ValueError("Unknown spend reservation")
            self.db.execute("UPDATE spend SET actual=?,note=? WHERE job=?", (actual, note, job))
        return actual > row[0]

    def set_job(self, job, status, result=None):
        self.db.execute("UPDATE jobs SET status=?, result=COALESCE(?,result), started=COALESCE(started,?),finished=? WHERE id=?",
                        (status, canonical(result) if result is not None else None, time.time(),
                         None if status in {"running", "pending"} else time.time(), job))

    def remote(self, job, value):
        self.db.execute("UPDATE jobs SET remote=? WHERE id=?", (canonical(value), job))

    def event(self, run, job, kind, detail):
        self.db.execute("INSERT INTO events(run,job,at,kind,detail) VALUES(?,?,?,?,?)", (run, job, time.time(), kind, canonical(detail)))

    def beat(self, run):
        self.db.execute("INSERT INTO heartbeat VALUES(?,?) ON CONFLICT(run) DO UPDATE SET at=excluded.at", (run, time.time()))

    def checkpoint(self, key, value=None):
        if value is not None:
            self.db.execute("INSERT INTO source_state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, canonical(value)))
        row = self.db.execute("SELECT value FROM source_state WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def artifact(self, payload: bytes, extension="bin") -> dict:
        checksum = hashlib.sha256(payload).hexdigest()
        path = self.root / "blobs" / checksum[:2] / f"{checksum}.{identifier(extension)}"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            temporary = path.with_name(f".{uuid.uuid4().hex}.tmp")
            with temporary.open("xb") as stream:
                stream.write(payload); stream.flush(); os.fsync(stream.fileno())
            os.replace(temporary, path)
        return {"path": str(path.relative_to(self.root)), "sha256": checksum, "bytes": len(payload)}

    def read_artifact(self, artifact):
        path = (self.root / artifact["path"]).resolve()
        if not path.is_relative_to(self.root): raise ValueError("Artifact path escaped data directory")
        payload = path.read_bytes()
        if hashlib.sha256(payload).hexdigest() != artifact["sha256"]: raise ValueError("Artifact checksum mismatch")
        return payload

    def write_report(self, run, filename, value):
        identifier(run)
        if Path(filename).name != filename: raise ValueError("Invalid report filename")
        path = self.root / "reports" / run / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f".{uuid.uuid4().hex}.tmp")
        temporary.write_text(value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
        os.replace(temporary, path)
        return path
