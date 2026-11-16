"""Trusted adapter registry. Only local reviewed code can register an adapter.
Job payload cannot choose executable, module, output directory, session or argv.
"""
from dataclasses import dataclass
from pathlib import Path
import os
import subprocess
import sys
from .config import ROOT, Settings
from .models import handle_name


@dataclass(frozen=True)
class CollectorOutput:
    posts_path: Path
    coverage_path: Path
    returncode: int
    snapshots_path: Path | None = None


class SubprocessCollector:
    def __init__(self, mode):
        if mode not in {"public", "api"}:
            raise ValueError("Unsupported collector mode")
        self.mode = mode

    def collect(self, payload):
        handle = handle_name(payload["handle"])
        script = ROOT / "scripts" / "collect_history.py"
        if not script.is_file():
            raise RuntimeError("Trusted collector CLI missing")
        timeout = Settings.from_env().collector_timeout
        data_root = ROOT if self.mode == 'public' else ROOT / 'research' / 'telegram_api_data'
        command = [sys.executable, str(script), self.mode, handle, "--root", str(data_root), "--max-pages", str(payload["max_pages"]), "--max-seconds", str(max(1, timeout - 30))]
        if payload.get("resume"):
            command.append("--resume")
        if self.mode == "api":
            session = os.getenv("TELEGRAM_SESSION_PATH")
            if not session or not Path(session).expanduser().with_suffix(".session").is_file():
                raise RuntimeError("Authorized collector requires a privately pre-authorized TELEGRAM_SESSION_PATH")
            command.extend(["--session", str(Path(session).expanduser())])
        # Database and API access secrets are not passed to the collector process.
        environment = {key: value for key, value in os.environ.items() if key in {"PATH", "HOME", "LANG", "LC_ALL", "API_ID", "API_HASH", "SYSTEMROOT"}}
        environment["PYTHONPATH"] = str(ROOT)
        environment["PYTHONUNBUFFERED"] = "1"
        process = subprocess.run(command, cwd=ROOT, env=environment, stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=timeout, check=False, shell=False)
        # 1 is expected for a partial run; it is not a fictitious full history.
        if process.returncode not in {0, 1}:
            raise RuntimeError("Collector failed or requires local authorization")
        method = "public_web" if self.mode == "public" else "authorized_api"
        return CollectorOutput(data_root / "research" / "posts" / f"{handle}.jsonl", data_root / "evidence" / "coverage" / f"{handle}.json", process.returncode,
            data_root / "evidence" / "snapshots" / f"{handle}.{method}.jsonl")


ADAPTERS = {"public_web": SubprocessCollector("public"), "authorized_api": SubprocessCollector("api")}


def adapter_for(method):
    if method not in ADAPTERS:
        raise ValueError("No trusted adapter registered")
    return ADAPTERS[method]
