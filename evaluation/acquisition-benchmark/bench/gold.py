"""Independent references and discovery candidates. Never auto-label a provider's output."""
import json
from pathlib import Path

from bench.config import digest
from bench.processing import similarity, source_reference_gaps
from bench.safety import validate_public_http_url, UnsafeTargetError


def validate(config):
    errors, articles, sources, calibration = [], 0, 0, 0
    coverage_only_sources = []
    for target in config["targets"]:
        path = target.get("reference")
        if not path:
            errors.append({"target": target["id"], "error": "missing_independent_reference"}); continue
        try:
            reference = json.loads(Path(path).read_text(encoding="utf-8"))
            if target["kind"] == "article":
                if not reference.get("title") or not reference.get("body") or len(reference.get("anchors", [])) < 3:
                    raise ValueError("Article reference needs title, body and at least three ordered anchors")
                if "published_at" not in reference: raise ValueError("Explicit published_at required; use null when absent")
                if target.get("calibration"): calibration += 1
                else: articles += 1
            else:
                items = reference.get("items", [])
                if not items or any(not item.get("id") for item in items): raise ValueError("Independent source item IDs required")
                if any(not isinstance(item.get("aliases", []), list) for item in items):
                    raise ValueError("Reference aliases must be lists")
                ids = {str(item["id"]) for item in items}
                aliases = [str(alias) for item in items for alias in item.get("aliases", [])]
                if len(ids) != len(items): raise ValueError("Duplicate reference IDs")
                if len(set(aliases)) != len(aliases) or ids & set(aliases):
                    raise ValueError("Reference IDs and aliases must be unique and disjoint")
                gaps = [{"id": str(item["id"]), "fields": source_reference_gaps(item)} for item in items if source_reference_gaps(item)]
                if gaps: coverage_only_sources.append({"target": target["id"], "reference_fields_missing": gaps})
                sources += 1
        except (OSError, ValueError) as error: errors.append({"target": target["id"], "error": str(error)})
    return {"valid": not errors, "unseen_articles": articles, "calibration_articles": calibration, "source_references": sources,
            "stage2_article_sample_ready": articles >= 40 and calibration >= 5,
            "coverage_only_source_references": coverage_only_sources, "errors": errors}


def compare(first, second):
    one, two = json.loads(first.read_text(encoding="utf-8")), json.loads(second.read_text(encoding="utf-8"))
    body = similarity(one.get("body", ""), two.get("body", ""))
    return {"body": body, "title": similarity(one.get("title", ""), two.get("title", "")),
            "meets_body_agreement_threshold": body["f1"] >= .95, "first_sha256": digest(one), "second_sha256": digest(two)}


def discover(state, run, limit=20):
    routes = [route["id"] for route in state.manifest(run)["config"]["routes"] if route["adapter"] in {"direct_http", "zyte_http", "brightdata_unlocker", "browser_playwright"}]
    if not routes: raise ValueError("Run configuration needs article acquisition routes")
    seen, targets = set(), []
    for job in state.jobs(run):
        if job["spec"]["target"]["kind"] not in {"rss", "google_news"}: continue
        for step in (job["result"] or {}).get("steps", []):
            for item in step.get("normalized", {}).get("items", []):
                url = item.get("url")
                if not url or url in seen: continue
                try: validate_public_http_url(url, resolver=lambda *_: ("93.184.216.34",))
                except (ValueError, UnsafeTargetError): continue
                seen.add(url)
                targets.append({"id": "daily_" + digest(url)[:16], "kind": "article", "input": url, "routes": routes,
                                "discovered_in_run": run, "independent_reference_needed": True})
                if len(targets) >= limit: return targets
    return targets
