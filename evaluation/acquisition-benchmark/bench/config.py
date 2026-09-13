"""Versioned experiment configuration. Loading/planning never contacts providers."""
from __future__ import annotations

import copy
import hashlib
import json
import math
import os
from pathlib import Path
import re

ADAPTERS = {
    "direct_http", "zyte_http", "brightdata_unlocker", "browser_playwright",
    "rss", "google_news_rss", "telegram_public", "telethon", "apify",
    "x_api", "brightdata_social", "linkedin_api", "fixture",
}
KINDS = {"article", "rss", "google_news", "telegram", "x_profile", "x_search", "linkedin_company", "linkedin_profile", "apify"}
PAID = {"zyte_http", "brightdata_unlocker", "apify", "x_api", "brightdata_social", "linkedin_api"}
DEFAULT_LIMITS = {
    "concurrency": 2, "attempt_seconds": 45, "job_seconds": 600,
    "max_bytes": 10 * 1024 * 1024, "max_job_bytes": 50 * 1024 * 1024,
    "max_pages": 3, "max_items": 50, "redirects": 5, "domain_interval_seconds": 10,
    "poll_seconds": 10, "min_free_disk_bytes": 20 * 1024**3,
}


def canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def digest(value: object) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def identifier(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}", value):
        raise ValueError(f"Invalid identifier: {value!r}")
    return value


def number(value, name, *, minimum=0):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < minimum:
        raise ValueError(f"{name} must be a finite number >= {minimum}")
    return value


def reject_secrets(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if re.search(r"(^|_)(password|secret|token|api_key|api_hash|authorization|cookie)$", str(key), re.I):
                raise ValueError(f"Keep credentials outside configuration: {key}; use a credential environment-variable name")
            reject_secrets(child)
    elif isinstance(value, list):
        for child in value: reject_secrets(child)


def load(path: Path) -> dict:
    import yaml
    config = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(config, dict): raise ValueError("Configuration must be a mapping")
    reject_secrets(config)
    config = copy.deepcopy(config)
    if config.get("version") != 1: raise ValueError("Configuration version must be 1")
    if config.get("mode") not in {"offline", "live"}: raise ValueError("mode must be offline or live")
    base = path.resolve().parent
    config["base_dir"] = str(base)
    config["data_dir"] = str((base / config.get("data_dir", "../data")).resolve())
    if config.get("credentials_file"):
        config["credentials_file"] = str((base / Path(config["credentials_file"]).expanduser()).resolve())
    if config.get("schedule", {}).get("daily_targets_dir"):
        config["schedule"]["daily_targets_dir"] = str((base / Path(config["schedule"]["daily_targets_dir"]).expanduser()).resolve())
    config["limits"] = DEFAULT_LIMITS | config.get("limits", {})
    for key, value in config["limits"].items(): number(value, f"limits.{key}")
    for key in ("concurrency", "max_bytes", "max_job_bytes", "max_pages", "max_items", "redirects"):
        if type(config["limits"][key]) is not int: raise ValueError(f"{key} must be an integer")
    if not 1 <= config["limits"]["concurrency"] <= 2: raise ValueError("concurrency must be 1 or 2")
    for key in ("max_bytes", "max_job_bytes", "max_pages", "max_items", "attempt_seconds", "job_seconds"):
        number(config["limits"][key], key, minimum=1)
    if config["limits"]["poll_seconds"] < 1: raise ValueError("poll_seconds must be >= 1")
    if type(config.get("repetitions", 1)) is not int or not 1 <= config.get("repetitions", 1) <= 100:
        raise ValueError("repetitions must be between 1 and 100")
    config.setdefault("repetitions", 1)
    config.setdefault("seed", 0)
    config.setdefault("extractors", ["trafilatura", "readability"])
    if not config["extractors"]: raise ValueError("At least one extractor required")
    if not set(config["extractors"]) <= {"trafilatura", "readability", "fixture"}:
        raise ValueError("Unsupported extractor")
    if config["mode"] == "live" and "fixture" in config["extractors"]:
        raise ValueError("Fixture extractor is offline-only")
    budget = config.setdefault("budget", {"total_usd": 0, "providers": {}})
    number(budget.get("total_usd", 0), "budget.total_usd")
    for value in budget.get("providers", {}).values(): number(value, "provider budget")
    routes = config.get("routes", [])
    targets = config.get("targets", [])
    if not routes or not targets: raise ValueError("Provide routes and targets")
    route_ids = set()
    for route in routes:
        route_id = identifier(route["id"])
        if route_id in route_ids: raise ValueError("Duplicate route ID")
        route_ids.add(route_id)
        if route["adapter"] not in ADAPTERS: raise ValueError("Unknown adapter")
        route.setdefault("enabled", False)
        if type(route["enabled"]) is not bool: raise ValueError("enabled must be boolean")
        route.setdefault("settings", {})
        if not isinstance(route["settings"], dict): raise ValueError("Route settings must be a mapping")
        if route["adapter"] == "zyte_http" and not isinstance(route["settings"].get("request", {}), dict):
            raise ValueError("Zyte request settings must be a mapping")
        route.setdefault("provider", route["adapter"])
        identifier(route["provider"])
        if route["enabled"] and route["adapter"] in PAID and config["mode"] == "live":
            number(route.get("cost_ceiling_usd"), "cost_ceiling_usd", minimum=0.000001)
            number(budget.get("total_usd"), "total budget", minimum=0.000001)
            number(budget.get("providers", {}).get(route["provider"]), "provider budget", minimum=0.000001)
            if route.get("cost_bound_confirmed") is not True:
                raise ValueError("Confirm account-side job/item/runtime cost bounds before enabling paid routes")
        if route["enabled"] and config["mode"] == "live" and route["adapter"] in {"apify", "brightdata_social"}:
            if route["settings"].get("schema_confirmed") is not True:
                raise ValueError("Confirm the selected actor/dataset input schema before enabling this route")
    seen = set()
    extra_targets = []
    for key, values in config.get("targets_by_round", {}).items():
        if not str(key).isdigit() or not isinstance(values, list): raise ValueError("targets_by_round maps round numbers to target lists")
        extra_targets.extend(values)
    for target in targets + extra_targets:
        if identifier(target["id"]) in seen: raise ValueError("Duplicate target ID")
        seen.add(target["id"])
        if target.get("kind") not in KINDS: raise ValueError("Unknown target kind")
        if not isinstance(target.get("input"), str) or not target["input"]: raise ValueError("Target needs input")
        if not target.get("routes") or not set(target["routes"]) <= route_ids: raise ValueError("Target refers to unknown/empty routes")
        if len(set(target["routes"])) != len(target["routes"]): raise ValueError("Duplicate target route")
        options = target.get("options", {})
        if options.get("start_time") or options.get("end_time"):
            from bench.adapters import utc
            if not options.get("start_time") or not options.get("end_time") or utc(options["start_time"]) >= utc(options["end_time"]):
                raise ValueError("Provide an ordered start_time/end_time pair with timezones")
        for field in ("reference", "fixture"):
            if target.get(field): target[field] = str((base / target[field]).resolve())
        target["fixtures"] = {key: str((base / val).resolve()) for key, val in target.get("fixtures", {}).items()}
    for chain in config.get("chains", []):
        identifier(chain["id"])
        if not chain.get("routes") or not set(chain["routes"]) <= route_ids: raise ValueError("Unknown chain route")
        if len(set(chain["routes"])) != len(chain["routes"]): raise ValueError("Duplicate chain route")
        number(chain.get("deadline_seconds", 90), "chain deadline", minimum=1)
    return config


def credentials(path: str | None) -> dict[str, str]:
    """Read simple KEY=VALUE files without executing shell text. Environment wins."""
    values = {}
    if path:
        for line in Path(path).expanduser().read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"): continue
            key, separator, value = line.partition("=")
            if not separator or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key): raise ValueError("Invalid credential file entry")
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'": value = value[1:-1]
            values[key] = value
    return values | dict(os.environ)


def template(value, target: dict):
    """Replace only whole-string placeholders; never evaluate expressions/code."""
    if isinstance(value, dict): return {key: template(child, target) for key, child in value.items()}
    if isinstance(value, list): return [template(child, target) for child in value]
    if isinstance(value, str) and re.fullmatch(r"\{[a-z_]+\}", value):
        key = value[1:-1]
        if key not in target and key not in target.get("options", {}): raise ValueError(f"Missing template input {key}")
        return target.get(key, target.get("options", {}).get(key))
    return value
