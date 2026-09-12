from __future__ import annotations

import ipaddress
import socket
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from urllib.parse import urlsplit


AddressResolver = Callable[[str, int], Iterable[str]]


class UnsafeTargetError(ValueError):
    """Raised when a target is malformed or can reach a non-public network."""


class DnsResolutionError(UnsafeTargetError):
    """Raised when a public target hostname cannot be resolved."""


@dataclass(frozen=True, slots=True)
class ValidatedTarget:
    url: str
    hostname: str
    port: int
    addresses: tuple[str, ...]


def resolve_addresses(hostname: str, port: int) -> tuple[str, ...]:
    try:
        address_info = socket.getaddrinfo(
            hostname,
            port,
            type=socket.SOCK_STREAM,
        )
    except socket.gaierror as error:
        raise DnsResolutionError(f"DNS resolution failed for {hostname}") from error

    addresses = tuple(sorted({item[4][0] for item in address_info}))
    if not addresses:
        raise DnsResolutionError(f"DNS returned no addresses for {hostname}")
    return addresses


def is_public_address(value: str) -> bool:
    try:
        return ipaddress.ip_address(value).is_global
    except ValueError:
        return False


def validate_public_http_url(
    url: str,
    *,
    resolver: AddressResolver = resolve_addresses,
) -> ValidatedTarget:
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as error:
        raise UnsafeTargetError("URL contains an invalid port") from error

    if parsed.scheme.lower() not in {"http", "https"}:
        raise UnsafeTargetError("only http and https URLs are allowed")
    if not parsed.hostname:
        raise UnsafeTargetError("URL must include a hostname")
    if parsed.username is not None or parsed.password is not None:
        raise UnsafeTargetError("URL credentials are not allowed")

    hostname = parsed.hostname.rstrip(".").lower()
    if hostname == "localhost" or hostname.endswith(".localhost"):
        raise UnsafeTargetError("localhost targets are not allowed")

    effective_port = port or (443 if parsed.scheme.lower() == "https" else 80)

    try:
        literal_address = ipaddress.ip_address(hostname)
        addresses = (str(literal_address),)
    except ValueError:
        addresses = tuple(dict.fromkeys(resolver(hostname, effective_port)))

    if not addresses:
        raise UnsafeTargetError(f"DNS returned no addresses for {hostname}")

    unsafe_addresses = [address for address in addresses if not is_public_address(address)]
    if unsafe_addresses:
        joined = ", ".join(unsafe_addresses)
        raise UnsafeTargetError(f"target resolves to a non-public address: {joined}")

    return ValidatedTarget(
        url=url,
        hostname=hostname,
        port=effective_port,
        addresses=addresses,
    )
