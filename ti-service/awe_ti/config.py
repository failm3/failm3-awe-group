"""Environment configuration. Never include credentials in API responses or logs."""
from dataclasses import dataclass
from pathlib import Path
import os
from dotenv import load_dotenv

PACKAGE_ROOT = Path(__file__).resolve().parent.parent
ROOT = Path(os.environ.get("AWE_TI_ROOT", str(PACKAGE_ROOT))).expanduser().resolve()
if not os.environ.get("AWE_TI_ROOT") and not (ROOT / "CONTRACT.md").is_file():
    candidate = Path.cwd().resolve()
    if (candidate / "CONTRACT.md").is_file() and (candidate / "awe_ti").is_dir():
        ROOT = candidate
load_dotenv(ROOT / ".env", override=False)

@dataclass(frozen=True)
class Settings:
    database_url: str
    api_token: str
    admin_api_token: str
    host: str
    port: int
    github_token: str
    collector_timeout: int
    live_test_max_age_days: int

    @classmethod
    def from_env(cls):
        return cls(
            os.getenv("DATABASE_URL", "postgresql://awe_ti@localhost:5432/awe_ti"),
            os.getenv("API_TOKEN", ""), os.getenv("ADMIN_API_TOKEN", ""),
            os.getenv("API_HOST", "127.0.0.1"), int(os.getenv("API_PORT", "8000")),
            os.getenv("GITHUB_TOKEN", ""), int(os.getenv("COLLECTOR_TIMEOUT", "600")),
            int(os.getenv("LIVE_TEST_MAX_AGE_DAYS", "30")),
        )
