"""Independent article/source scoring; no acquisition or provider calls."""
from collections import Counter
from datetime import datetime, timezone
import math
import re
import unicodedata
from urllib.parse import urlsplit, urlunsplit

from bench.validator import article_validation


def normalize_text(text):
    text = unicodedata.normalize("NFKC", str(text)).lower()
    text = re.sub(r"[\u064b-\u065f\u0670\u0640]", "", text)
    text = re.sub(r"[أإآٱ]", "ا", text)
    return " ".join(re.findall(r"\w+", text, re.UNICODE))


def similarity(actual, expected):
    left, right = Counter(normalize_text(actual).split()), Counter(normalize_text(expected).split())
    shared = sum((left & right).values())
    precision = shared / sum(left.values()) if left else 0
    recall = shared / sum(right.values()) if right else 0
    return {"precision": precision, "recall": recall, "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0}


def date_matches(actual, expected, precision="minute"):
    if expected is None: return actual is None
    if not actual: return False
    try:
        # Day-only publisher dates stay day-precision; no fabricated time is implied.
        if precision == "day": return str(actual)[:10] == str(expected)[:10]
        first = datetime.fromisoformat(str(actual).replace("Z", "+00:00"))
        second = datetime.fromisoformat(str(expected).replace("Z", "+00:00"))
        if first.tzinfo is None or second.tzinfo is None: return False
        return abs((first - second).total_seconds()) <= (3600 if precision == "hour" else 300)
    except (TypeError, ValueError): return False


def canonical_url(value):
    if not value: return None
    parsed = urlsplit(str(value))
    # X permalinks can use a username or i/web. Compare their stable status ID.
    if parsed.hostname in {"x.com", "www.x.com", "twitter.com", "www.twitter.com"}:
        match = re.search(r"/status/(\d+)", parsed.path)
        if match: return "x-status:" + match[1]
    return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path.rstrip("/"), parsed.query, ""))


def score_article(article, reference):
    validation = article_validation(article)
    if reference and reference.get("source_changed"):
        return {"label": "SOURCE_CHANGED", "validation": validation, "verified": True}
    if not reference:
        return {"label": "AUTO_UNVERIFIED" if validation["accepted"] else "AUTO_FAIL", "validation": validation, "verified": False}
    quality = similarity(article.get("body", ""), reference.get("body", ""))
    title = similarity(article.get("title", ""), reference.get("title", ""))["f1"]
    body = normalize_text(article.get("body", ""))
    anchors = [normalize_text(anchor) for anchor in reference.get("anchors", []) if normalize_text(anchor)]
    positions = [body.find(anchor) for anchor in anchors]
    ordered = all(index >= 0 for index in positions) and positions == sorted(positions)
    boilerplate = any(normalize_text(value) in body for value in reference.get("must_not_contain", []) if value)
    precision = reference.get("date_precision", "minute")
    dates = date_matches(article.get("published_at"), reference.get("published_at"), precision) if "published_at" in reference else True
    # HTML metadata fills the scored date for every extractor; this keeps each extractor's own date comparable.
    native = article.get("extractor_metadata", {})
    extractor_dates = date_matches(native.get("published_at"), reference.get("published_at"), precision) if "published_at" in reference and "published_at" in native else None
    identity = reference.get("identity_correct", True)
    if reference.get("accepted_urls"):
        identity = identity and canonical_url(article.get("url")) in {canonical_url(url) for url in reference["accepted_urls"]}
    if not validation["accepted"]: label = "FAIL"
    elif not identity or quality["f1"] < 0.5 or (anchors and all(index < 0 for index in positions)): label = "FALSE_SUCCESS"
    elif quality["f1"] >= 0.9 and title >= 0.9 and ordered and not boilerplate and dates: label = "PASS"
    else: label = "PARTIAL"
    return {"label": label, "verified": True, "validation": validation, **quality,
            "title_f1": title, "anchors_ordered": ordered, "date_correct": dates, "extractor_date_correct": extractor_dates,
            "date_source": (article.get("metadata_provenance", {}).get("published_at") or {}).get("source"), "boilerplate": boilerplate}


def parsed_date(value):
    if value is None: return None
    try:
        if isinstance(value, (float, int)):
            value = datetime.fromtimestamp(value / (1000 if value > 100_000_000_000 else 1), timezone.utc).isoformat()
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None: return None
        return parsed.astimezone(timezone.utc).isoformat()
    except (ValueError, OverflowError, OSError): return None


def source_reference_gaps(item):
    """ID inventories establish coverage; content quality needs explicit field evidence."""
    missing = []
    expected_text = item.get("text")
    if not isinstance(expected_text, str): missing.append("text")
    elif not expected_text.strip() and item.get("has_media") is not True:
        missing.append("nonempty_text_or_expected_media")
    if "published_at" not in item: missing.append("published_at")
    return missing


def collection_window(target):
    options = target.get("options", {})
    start, end = parsed_date(options.get("start_time")), parsed_date(options.get("end_time"))
    return {"start_time": start, "end_time": end} if start and end else None


def reference_window(reference):
    window = reference.get("window") if isinstance(reference.get("window"), dict) else {}
    start, end = parsed_date(window.get("start_time")), parsed_date(window.get("end_time"))
    return {"start_time": start, "end_time": end} if start and end else None


def window_check(reference, target):
    """A complete reference is complete only for the window it was built for."""
    if not reference.get("complete_window"): return None
    wanted, declared = collection_window(target), reference_window(reference)
    if wanted is None: return None if declared is None else "reference_window_on_unwindowed_target"
    if declared is None: return "reference_window_missing"
    return None if declared == wanted else "reference_window_mismatch"


def score_source(normalized, reference, target, fetched_at=None):
    original_items = normalized["items"]
    window = collection_window(target)
    start, end = (window["start_time"], window["end_time"]) if window else (None, None)
    def in_window(item):
        date = parsed_date(item.get("published_at"))
        return not start or not end or date is None or start <= date < end
    items = [item for item in original_items if in_window(item)]
    counts = Counter(str(item.get("id", "")) for item in items)
    indexed = {str(item["id"]): item for item in items if item.get("id")}
    result = {"label": "SOURCE_UNVERIFIED", "verified": False, "quality_verified": False, "returned": len(items), "unique": len(indexed),
              "duplicates": sum(count - 1 for count in counts.values()), "issues": normalized.get("issues", []),
              "missing_dates": sum(not parsed_date(item.get("published_at")) for item in items),
              "outside_window": len(original_items)-len(items), "normalization_dropped": normalized.get("normalization_dropped", 0),
              "missing_item_ids": sum(not item.get("id") for item in items)}
    if fetched_at:
        stamp = datetime.fromisoformat(fetched_at)
        result["publication_age_seconds"] = [round((stamp-datetime.fromisoformat(parsed_date(item["published_at"]))).total_seconds()) for item in items if parsed_date(item.get("published_at"))]
    if not reference: return result
    expected = reference.get("items", [])
    if not expected: return result | {"reference_error": "empty_reference_does_not_establish_recall"}
    if any("id" not in item or not isinstance(item.get("aliases", []), list) for item in expected):
        return result | {"reference_error": "reference_items_need_ids_and_alias_lists"}
    ids = {str(item["id"]) for item in expected}
    aliases = [str(alias) for item in expected for alias in item.get("aliases", [])]
    if len(ids) != len(expected) or len(set(aliases)) != len(aliases) or ids & set(aliases):
        return result | {"reference_error": "reference_ids_and_aliases_must_be_unique_and_disjoint"}
    # Manual references may enumerate equivalent provider-specific stable identifiers.
    for original in expected:
        if str(original["id"]) not in indexed:
            for alias in original.get("aliases", []):
                if str(alias) in indexed:
                    indexed[str(original["id"])] = indexed[str(alias)]; break
    found = ids & indexed.keys()
    reference_gaps = [{"id": str(item["id"]), "fields": source_reference_gaps(item)} for item in expected if source_reference_gaps(item)]
    checks = []
    for original in expected:
        actual = indexed.get(str(original["id"]))
        if actual is None: continue
        text_score = similarity(actual.get("text", ""), original["text"]) if isinstance(original.get("text"), str) else None
        if isinstance(original.get("text"), str) and not original["text"].strip() and not str(actual.get("text") or "").strip():
            text_score = {"precision": 1, "recall": 1, "f1": 1}  # Explicitly labelled media-only post.
        checks.append({"id": str(original["id"]), "quality_reference_complete": not source_reference_gaps(original),
            "text": text_score,
            "date_correct": date_matches(actual.get("published_at"), original.get("published_at"), original.get("date_precision", "minute")) if "published_at" in original else None,
            "url_correct": canonical_url(actual.get("url")) == canonical_url(original["url"]) if "url" in original else None,
            "media_present_correct": bool(actual.get("media")) == original["has_media"] if "has_media" in original else None,
            "links_present": all(canonical_url(url) in {canonical_url(value) for value in actual.get("links", [])} for url in original["links"]) if "links" in original else None})
    window_error = window_check(reference, target)
    complete = bool(reference.get("complete_window", False)) and window_error is None
    accepted_ids = ids | {str(alias) for original in expected for alias in original.get("aliases", [])}
    extra_ids = sorted(indexed.keys() - accepted_ids)
    correct = sum(check["quality_reference_complete"] and all(check.get(key) is not False for key in ("date_correct", "url_correct", "media_present_correct", "links_present")) and check["text"] is not None and check["text"]["f1"] >= .9 for check in checks)
    label = "SOURCE_COVERAGE_ONLY" if reference_gaps else "SOURCE_VERIFIED_SAMPLE"
    quality_verified = bool(complete and not reference_gaps)
    if quality_verified:
        label = "PASS" if correct / len(ids) >= .95 and not result["duplicates"] and not result["missing_item_ids"] and not result["issues"] and not result["normalization_dropped"] and not extra_ids else "PARTIAL" if correct else "FAIL"
        if items and not found: label = "FALSE_SUCCESS"
    return result | {"label": label, "verified": True, "quality_verified": quality_verified,
        "reference_count": len(ids), "quality_reference_count": len(ids)-len(reference_gaps),
        "reference_fields_missing": reference_gaps, "correct_items": correct,
        "found": len(found), "sample_coverage": len(found) / len(ids), "recall": len(found) / len(ids) if complete else None,
        "collection_window": window, "reference_window": reference_window(reference), "reference_window_error": window_error,
        "missing_reference_ids": sorted(ids - indexed.keys()), "extra_ids": extra_ids, "item_checks": checks}


def wilson(successes, total):
    if not total: return None
    z, p = 1.959963984540054, successes / total
    center = (p + z*z/(2*total))/(1+z*z/total)
    width = z*math.sqrt(p*(1-p)/total + z*z/(4*total*total))/(1+z*z/total)
    return [max(0, center-width), min(1, center+width)]
