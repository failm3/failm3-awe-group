from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
import hashlib
import json
import re
from pydantic import BaseModel, Field, ConfigDict, field_validator


def utcnow():
    return datetime.now(timezone.utc)


def stable_hash(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


def canonical_url(value: str | None):
    if not value:
        return None
    p = urlsplit(value.strip())
    if p.scheme.lower() not in {"http", "https"} or not p.hostname or p.username or p.password:
        raise ValueError("Only absolute HTTP(S) URLs without credentials are allowed")
    host = p.hostname.encode("idna").decode().lower().rstrip(".")
    if ":" in host:
        host = f"[{host}]"
    port = p.port
    netloc = host if port is None or (p.scheme.lower(), port) in {("http", 80), ("https", 443)} else f"{host}:{port}"
    path = p.path.rstrip("/")
    if host == "github.com":
        parts = path.split("/")
        if len(parts) == 3:
            path = path.removesuffix(".git").lower()
    query = urlencode(sorted((k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"}))
    return urlunsplit((p.scheme.lower(), netloc, path, query, ""))


def handle_name(value):
    value = value.strip().lstrip("@").lower()
    if not re.fullmatch(r"[a-z0-9_]{3,64}", value):
        raise ValueError("Invalid public Telegram handle")
    return value


class ImportModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class PostImport(ImportModel):
    source_handle: str
    source_url: str | None = None
    source_title: str | None = None
    message_id: str
    url: str | None = None
    published_at: datetime | None = None
    text: str = ""
    links: list[str] = Field(default_factory=list)
    media: list[dict[str, Any]] = Field(default_factory=list)
    forwarded_from: str | None = None
    raw_hash: str | None = None
    collected_at: datetime = Field(default_factory=utcnow)
    raw: dict[str, Any] = Field(default_factory=dict)

    @field_validator("source_handle")
    @classmethod
    def handle_valid(cls, v):
        return handle_name(v)

    @field_validator("message_id", mode="before")
    @classmethod
    def id_string(cls, v):
        if v is None or not str(v):
            raise ValueError("message_id must be non-empty")
        return str(v)

    @field_validator("published_at", "collected_at")
    @classmethod
    def aware(cls, v):
        if v is not None:
            return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v.astimezone(timezone.utc)
        return v


class Claim(ImportModel):
    field: str
    value: Any = None
    evidence_url: str | None = None
    checked_at: datetime | None = None


class ResourceImport(ImportModel):
    name: str = Field(min_length=1, max_length=512)
    official_url: str | None = None
    repository_url: str | None = None
    resource_type: str | None = None
    description: str | None = None
    capabilities: list[str | dict[str, Any]] = Field(default_factory=list)
    integrations: list[str | dict[str, Any]] = Field(default_factory=list)
    verification_status: str | None = None
    claims: list[Claim] = Field(default_factory=list)
    pricing: dict[str, Any] | None = None
    license: dict[str, Any] | None = None
    provenance: list[dict[str, Any]] = Field(default_factory=list)
    decision: str | None = None
    limitations: list[Any] = Field(default_factory=list)

    @field_validator("official_url", "repository_url")
    @classmethod
    def urls(cls, v):
        return canonical_url(v)


class SourceRegistration(BaseModel):
    handle: str
    title: str | None = None
    method: str = "public_web"
    enabled: bool = False
    auto_enroll: bool = False
    evidence_urls: list[str] = Field(default_factory=list)
    authority: int = Field(default=0, ge=0, le=100)
    relevance: int = Field(default=0, ge=0, le=100)
    activity: int = Field(default=0, ge=0, le=100)
    diversity: int = Field(default=0, ge=0, le=100)

    @field_validator("handle")
    @classmethod
    def handle_valid(cls, v):
        return handle_name(v)

    @field_validator("method")
    @classmethod
    def method_valid(cls, v):
        if v not in {"public_web", "authorized_api"}:
            raise ValueError("Unsupported collector method")
        return v


class LiveTestInput(BaseModel):
    test_name: str = Field(min_length=3, max_length=200)
    result: str
    evidence_url: str
    evidence_hash: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    tested_at: datetime
    recorded_by: str = Field(min_length=1, max_length=200)
    notes: str | None = None

    @field_validator("result")
    @classmethod
    def result_valid(cls, v):
        if v not in {"passed", "failed", "inconclusive"}:
            raise ValueError("Invalid live test result")
        return v

    @field_validator("tested_at")
    @classmethod
    def timestamp(cls, v):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        if v > utcnow():
            raise ValueError("Live tests cannot be in the future")
        return v
