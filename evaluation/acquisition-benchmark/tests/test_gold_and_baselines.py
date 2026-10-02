import asyncio
import json
from pathlib import Path

import pytest

from bench.cli import main
from bench.config import load
from bench.gold import compare, discover, validate
from bench.processing import normalize, score_source
from bench.runner import Runner, plan, process_run
from bench.state import State

ROOT = Path(__file__).resolve().parents[1]


def test_production_parser_regressions_and_dropped_items_remain_visible():
    async def scenario():
        target = {"id": "news", "kind": "rss", "input": "https://example.com/feed"}
        route = {"adapter": "rss", "settings": {}}
        with pytest.raises(ValueError, match="not_a_feed"):
            await normalize(b"<html>Access denied</html>", target, route, "2026-09-01T00:00:00Z")
        malformed = b"<rss><channel><item><title>&#99999999;</title><pubDate>Tue, 01 Sep 2026 09:00:00 GMT</pubDate></item></channel></rss>"
        result = await normalize(malformed, target, route, "2026-09-01T00:00:00Z")
        assert result["items"][0]["text"] == "\ufffd"
        undated = json.dumps([{"title": "Undated", "url": "https://example.com/article"}]).encode()
        result = await normalize(undated, target | {"kind": "google_news"}, {"adapter": "apify", "settings": {}}, "2026-09-01T00:00:00Z")
        assert "raw_publication_date_missing" in result["issues"]
        assert result["baseline"] == [] and result["items"] == []
        assert result["normalization_dropped"] == 1
    asyncio.run(scenario())


def test_gold_validation_and_independent_agreement(tmp_path):
    config = load(ROOT / "configs/offline-demo.json")
    validation = validate(config)
    assert not validation["stage2_article_sample_ready"]
    other = tmp_path / "independent.json"
    other.write_text(json.dumps({"body": "An unrelated reference", "title": "Other"}), encoding="utf-8")
    assert not compare(ROOT / "fixtures/article.gold.json", other)["meets_body_agreement_threshold"]


def test_source_aliases_window_and_unexpected_items():
    target = {"options": {"start_time": "2026-09-01T00:00:00Z", "end_time": "2026-09-02T00:00:00Z"}}
    normalized = {"items": [{"id": "alias", "text": "A post", "published_at": "2026-09-01T01:00:00Z"},
                            {"id": "old", "text": "An old post", "published_at": "2026-08-01T00:00:00Z"}]}
    reference = {"complete_window": True, "window": target["options"],
                 "items": [{"id": "canonical", "aliases": ["alias"], "text": "A post", "published_at": "2026-09-01T01:00:00Z"}]}
    result = score_source(normalized, reference, target)
    assert result["label"] == "PASS" and result["outside_window"] == 1 and result["extra_ids"] == []
    normalized["items"].append({"id": "unexpected", "text": "Another", "published_at": "2026-09-01T01:00:00Z"})
    assert score_source(normalized, reference, target)["label"] == "PARTIAL"


@pytest.mark.parametrize("window,error", [
    (None, "reference_window_missing"),
    ({"start_time": "2026-08-31T00:00:00Z", "end_time": "2026-09-01T00:00:00Z"}, "reference_window_mismatch"),
])
def test_complete_reference_for_another_window_cannot_establish_recall_or_pass(window, error):
    # A scheduled round moves the window; yesterday's complete list must not score today's collection.
    target = {"options": {"start_time": "2026-09-01T00:00:00Z", "end_time": "2026-09-02T00:00:00Z"}}
    item = {"id": "one", "text": "A post", "published_at": "2026-09-01T01:00:00Z"}
    reference = {"complete_window": True, "items": [item]} | ({"window": window} if window else {})
    result = score_source({"items": [item, item | {"id": "new_today"}]}, reference, target)
    assert result["reference_window_error"] == error
    assert result["label"] == "SOURCE_VERIFIED_SAMPLE" and result["recall"] is None and not result["quality_verified"]
    assert result["sample_coverage"] == 1


def test_equivalent_timezone_offsets_match_the_collection_window():
    target = {"options": {"start_time": "2026-09-01T00:00:00Z", "end_time": "2026-09-02T00:00:00Z"}}
    item = {"id": "one", "text": "A post", "published_at": "2026-09-01T01:00:00Z"}
    reference = {"complete_window": True, "window": {"start_time": "2026-09-01T03:00:00+03:00", "end_time": "2026-09-02T03:00:00+03:00"}, "items": [item]}
    result = score_source({"items": [item]}, reference, target)
    assert result["reference_window_error"] is None and result["label"] == "PASS" and result["recall"] == 1


def test_gold_validation_rejects_window_mismatch_and_fixed_complete_references_for_rolling_rounds(tmp_path):
    config = load(ROOT / "configs/offline-demo.json")
    target = next(target for target in config["targets"] if target["kind"] == "rss")
    shifted = json.loads(Path(target["reference"]).read_text(encoding="utf-8"))
    shifted["window"] = {"start_time": "2026-08-31T00:00:00Z", "end_time": "2026-09-01T00:00:00Z"}
    path = tmp_path / "shifted.json"
    path.write_text(json.dumps(shifted), encoding="utf-8")
    config["targets"] = [target | {"reference": str(path)}]
    assert "reference_window_mismatch" in validate(config)["errors"][0]["error"]
    config["targets"] = [target]
    assert validate(config)["valid"]
    config["schedule"] = {"rolling_window_hours": 24}
    assert "per round" in validate(config)["errors"][0]["error"]


def test_complete_source_rejects_missing_ids_and_ambiguous_aliases():
    target = {"options": {}}
    reference = {"complete_window": True, "items": [{"id": "one", "text": "Expected", "published_at": None}]}
    normalized = {"items": [{"id": "one", "text": "Expected", "published_at": None},
                            {"id": None, "text": "Malformed", "published_at": None}]}
    assert score_source(normalized, reference, target)["label"] == "PARTIAL"
    ambiguous = {"complete_window": True, "items": [
        {"id": "one", "aliases": ["shared"]}, {"id": "two", "aliases": ["shared"]},
    ]}
    result = score_source({"items": [{"id": "shared"}]}, ambiguous, target)
    assert result["verified"] is False
    assert result["reference_error"] == "reference_ids_and_aliases_must_be_unique_and_disjoint"


@pytest.mark.parametrize("fields", [{}, {"text": "Expected"}, {"published_at": None}, {"text": "", "published_at": None}])
def test_incomplete_references_only_verify_coverage(fields):
    reference = {"complete_window": True, "items": [{"id": "one", **fields}]}
    result = score_source({"items": [{"id": "one", "text": "", "published_at": None}]}, reference, {})
    assert result["label"] == "SOURCE_COVERAGE_ONLY"
    assert result["recall"] == 1 and result["verified"]
    assert not result["quality_verified"] and result["correct_items"] == 0
    assert result["reference_fields_missing"]


def test_empty_text_fails_when_reference_expects_content():
    reference = {"complete_window": True, "items": [{"id": "one", "text": "Expected content", "published_at": None}]}
    result = score_source({"items": [{"id": "one", "text": "", "published_at": None}]}, reference, {})
    assert result["label"] == "FAIL" and result["correct_items"] == 0


def test_explicitly_absent_dates_are_valid_reference_evidence():
    item = {"id": "one", "text": "Undated publisher post", "published_at": None}
    result = score_source({"items": [item]}, {"complete_window": True, "items": [item]}, {})
    assert result["label"] == "PASS" and result["quality_verified"]
    assert result["missing_dates"] == 1  # Absence is measured, never replaced with fetch time.


@pytest.mark.parametrize("has_media", [True, False])
def test_media_only_post_needs_verified_media(has_media):
    item = {"id": "one", "text": "", "published_at": "2026-09-01T00:00:00Z"}
    reference = {"complete_window": True, "items": [item | {"has_media": True}]}
    result = score_source({"items": [item | {"media": [{"type": "photo"}] if has_media else []}]}, reference, {})
    assert result["label"] == ("PASS" if has_media else "FAIL")


def test_coverage_only_reference_is_visible_in_validation_and_excluded_from_quality_ranking(tmp_path):
    from bench.runner import report
    config = load(ROOT / "configs/offline-demo.json")
    target = next(target for target in config["targets"] if target["kind"] == "rss")
    target["routes"] = target["routes"][:1]
    reference = {"complete_window": True, "window": target["options"], "items": [{"id": "one"}]}
    gold = tmp_path / "inventory.json"
    gold.write_text(json.dumps(reference), encoding="utf-8")
    target["reference"] = str(gold)
    config["targets"] = [target]
    validation = validate(config)
    assert validation["valid"]
    assert validation["coverage_only_source_references"][0]["target"] == target["id"]
    manifest = plan(config)
    state = State(tmp_path / "data")
    try:
        state.create_run("coverage", {"config": config}, manifest["jobs"])
        score = score_source({"items": [{"id": "one", "text": "", "published_at": None}]}, reference, target)
        state.set_job("coverage-000000", "complete", {"steps": [{"route": target["routes"][0], "status": "captured", "duration_ms": 1, "source_score": score}]})
        group = next(iter(report(state, "coverage")["groups"].values()))
        assert group["unique_unseen"] == 0 and group["pass_rate"] is None
        assert group["cost_per_usable_result_usd"] is None and group["usable_results"] == 0
        assert group["source_results"][0]["recall"] == 1
    finally: state.close()


def test_attach_reference_and_discover_do_not_recollect(tmp_path, capsys):
    async def scenario():
        config = load(ROOT / "configs/offline-demo.json")
        config["data_dir"] = str(tmp_path)
        config["targets"] = [target for target in config["targets"] if target["kind"] == "rss"]
        manifest = plan(config)
        state = State(tmp_path)
        state.create_run("saved", {key: value for key, value in manifest.items() if key != "jobs"}, manifest["jobs"])
        await Runner(state, config).run("saved")
        await process_run(state, "saved")
        candidates = discover(state, "saved")
        assert len(candidates) == 2 and candidates[0]["routes"] == ["direct", "zyte", "unlocker", "browser", "browser_standard"]
        before = state.db.execute("SELECT count(*) FROM events WHERE kind='capture'").fetchone()[0]
        state.close()
        assert main(["attach-reference", "--data-dir", str(tmp_path), "--run-id", "saved", "--target-id", "rss", "--reference", str(ROOT / "fixtures/rss.gold.json")]) == 0
        state = State(tmp_path)
        assert state.db.execute("SELECT count(*) FROM events WHERE kind='capture'").fetchone()[0] == before
        assert state.db.execute("SELECT count(*) FROM events WHERE kind='reference_updated'").fetchone()[0] == 2
        state.close()
    asyncio.run(scenario())
