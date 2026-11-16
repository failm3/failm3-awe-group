"""Bounded HTTP(S) fetches; no proxies, cookies, scripts or discovered instructions.
DNS is resolved once per hop; urllib3 connects to that validated IP with original
Host, SNI and certificate hostname validation. Every redirect is validated anew.
"""
from dataclasses import dataclass
import ipaddress
import socket
from urllib.parse import urlsplit, urljoin
import urllib3
from .models import canonical_url


class UnsafeURL(ValueError):
    pass


@dataclass
class FetchResult:
    url: str
    status: int
    body: bytes
    headers: dict
    redirects: list[str]

    def json(self):
        import json
        return json.loads(self.body)


def public_ip(value):
    ip = ipaddress.ip_address(value.split("%")[0])
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast and not ip.is_unspecified and not ip.is_reserved


def validate_destination(url):
    if not isinstance(url, str) or len(url) > 4096 or any(c.isspace() or ord(c) < 32 for c in url) or "\\" in url:
        raise UnsafeURL("Invalid URL characters or length")
    try:
        clean = canonical_url(url)
        parsed = urlsplit(clean)
        host = parsed.hostname
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except (ValueError, UnicodeError) as error:
        raise UnsafeURL("Invalid HTTP destination") from error
    if port not in {80, 443}:
        raise UnsafeURL("Only ports 80 and 443 allowed")
    if host in {"localhost", "metadata.google.internal"} or host.endswith((".localhost", ".local", ".internal", ".invalid")):
        raise UnsafeURL("Forbidden hostname")
    try:
        records = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise UnsafeURL("DNS resolution failed") from error
    addresses = sorted({record[4][0] for record in records}, key=lambda ip: (":" in ip, ip))
    if not addresses or not all(public_ip(address) for address in addresses):
        raise UnsafeURL("DNS includes a non-public address")
    return clean, host, port, addresses[0]


def safe_fetch(url, headers=None, max_bytes=2_000_000, max_redirects=3, timeout=12):
    redirects = []
    initial_host = None
    for hop in range(max_redirects + 1):
        clean, host, port, pinned_ip = validate_destination(url)
        if initial_host is None:
            initial_host = host
        supplied = dict(headers or {})
        if host != initial_host:
            supplied.pop("Authorization", None)
            supplied.pop("authorization", None)
        if not clean.startswith("https:") and any(key.casefold() == "authorization" for key in supplied):
            raise UnsafeURL("Authorization requires HTTPS")
        supplied["Host"] = host if port in {80, 443} else f"{host}:{port}"
        supplied.setdefault("User-Agent", "AWE-Tool-Intelligence/0.1 (reachability-only)")
        supplied.setdefault("Accept", "application/json,text/html;q=0.8")
        # No environment proxy is consulted. TCP destination is the pinned IP.
        if clean.startswith("https:"):
            pool = urllib3.HTTPSConnectionPool(pinned_ip, port=port, server_hostname=host, assert_hostname=host, cert_reqs="CERT_REQUIRED", timeout=urllib3.Timeout(connect=timeout, read=timeout), maxsize=1)
        else:
            pool = urllib3.HTTPConnectionPool(pinned_ip, port=port, timeout=urllib3.Timeout(connect=timeout, read=timeout), maxsize=1)
        parsed = urlsplit(clean)
        target = (parsed.path or "/") + ("?" + parsed.query if parsed.query else "")
        response = None
        try:
            response = pool.request("GET", target, headers=supplied, redirect=False, retries=False, preload_content=False)
            if response.status in {301, 302, 303, 307, 308}:
                location = response.headers.get("Location")
                if not location or hop >= max_redirects:
                    raise UnsafeURL("Redirect limit or missing Location")
                redirects.append(clean)
                url = urljoin(clean, location)
                continue
            body = response.read(max_bytes + 1, decode_content=True)
            if len(body) > max_bytes:
                raise UnsafeURL("Response exceeds byte limit")
            return FetchResult(clean, response.status, body, dict(response.headers), redirects)
        finally:
            if response is not None:
                response.close()
            pool.close()
    raise UnsafeURL("Redirect limit exceeded")
