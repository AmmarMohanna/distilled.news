import pytest

from bench.safety import UnsafeTargetError, validate_public_http_url


def public_resolver(_hostname: str, _port: int) -> tuple[str, ...]:
    return ("93.184.216.34",)


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/article",
        "http://10.0.0.5/article",
        "http://169.254.169.254/latest/meta-data",
        "http://100.64.0.1/article",
        "http://[::1]/article",
        "http://[fc00::1]/article",
    ],
)
def test_rejects_non_public_literal_addresses(url: str) -> None:
    with pytest.raises(UnsafeTargetError, match="non-public"):
        validate_public_http_url(url, resolver=public_resolver)


def test_rejects_localhost_without_dns_resolution() -> None:
    with pytest.raises(UnsafeTargetError, match="localhost"):
        validate_public_http_url("http://localhost/article", resolver=public_resolver)


def test_rejects_non_http_schemes() -> None:
    with pytest.raises(UnsafeTargetError, match="only http and https"):
        validate_public_http_url("file:///etc/passwd", resolver=public_resolver)


def test_rejects_credentials_in_url() -> None:
    with pytest.raises(UnsafeTargetError, match="credentials"):
        validate_public_http_url(
            "https://user:password@example.com/article",
            resolver=public_resolver,
        )


def test_rejects_hostname_if_any_dns_answer_is_non_public() -> None:
    def mixed_resolver(_hostname: str, _port: int) -> tuple[str, ...]:
        return ("93.184.216.34", "10.0.0.2")

    with pytest.raises(UnsafeTargetError, match="10.0.0.2"):
        validate_public_http_url(
            "https://example.com/article",
            resolver=mixed_resolver,
        )


def test_accepts_public_https_target() -> None:
    target = validate_public_http_url(
        "https://EXAMPLE.com./article",
        resolver=public_resolver,
    )

    assert target.hostname == "example.com"
    assert target.port == 443
    assert target.addresses == ("93.184.216.34",)