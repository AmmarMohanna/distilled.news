import asyncio
import json
from pathlib import Path

import pytest

from bench.campaign import report_campaign
from bench.cli import main
from bench.config import load
from bench.processing import normalize, score_source
from bench.runner import Runner, plan, process_run
from bench.state import State

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("paged", [False, True])
def test_x_preserves_links_long_text_and_media_from_expansions(paged):
    photo = {"media_key": "photo", "type": "photo", "url": "https://example.com/photo.jpg"}
    video = {"media_key": "video", "type": "video", "preview_image_url": "https://example.com/video.jpg"}
    payload = {"data": [{"id": "1", "text": "Short version", "created_at": "2026-09-01T12:00:00Z",
        "note_tweet": {"text": "The complete long post", "entities": {"urls": [
            {"expanded_url": "https://example.com/article"}, {"expanded_url": "https://example.com/article"}]}},
        "attachments": {"media_keys": ["photo", "video"]}}],
        "includes": [{"media": [photo]}, {"media": [video]}] if paged else {"media": [photo, video]}}
    target = {"id": "x", "kind": "x_profile", "input": "account",
              "options": {"start_time": "2026-09-01T00:00:00Z", "end_time": "2026-09-02T00:00:00Z"}}
    normalized = asyncio.run(normalize(json.dumps(payload).encode(), target, {"adapter": "x_api", "settings": {}}, "2026-09-02T00:00:00Z"))
    item = normalized["items"][0]
    assert item["text"] == "The complete long post"
    assert item["links"] == ["https://example.com/article"]
    assert item["media"] == [photo, video] and item["unresolved_media_keys"] == []
    reference = {"complete_window": True, "window": target["options"], "items": [{"id": "1", "text": item["text"],
        "published_at": item["published_at"], "links": item["links"], "has_media": True}]}
    assert score_source(normalized, reference, target)["label"] == "PASS"


def test_x_missing_media_expansion_preserves_reference_without_fabricating_url():
    payload = {"data": [{"id": "2", "entities": {"urls": [{"url": "https://t.co/link"}]},
                         "attachments": {"media_keys": ["missing"]}}]}
    result = asyncio.run(normalize(json.dumps(payload).encode(), {"id": "x", "kind": "x_profile"},
                                  {"adapter": "x_api", "settings": {}}, "2026-09-02T00:00:00Z"))
    assert result["items"][0]["media"] == [{"media_key": "missing", "unresolved": True}]
    assert result["items"][0]["unresolved_media_keys"] == ["missing"]
    assert result["items"][0]["links"] == ["https://t.co/link"]


def config(tmp_path, repetitions=1):
    value = load(ROOT / "configs/offline-demo.json")
    value.update(data_dir=str(tmp_path), repetitions=repetitions, extractors=["fixture"])
    value["limits"]["domain_interval_seconds"] = 0
    value["targets"] = [{"id": "article", "kind": "article", "input": "https://example.com/article", "routes": ["direct"],
        "fixture": str(ROOT / "fixtures/article.json"), "reference": str(ROOT / "fixtures/article.gold.json")}]
    return value


async def prepare(state, value, run):
    manifest = plan(value)
    state.create_run(run, {key: item for key, item in manifest.items() if key != "jobs"}, manifest["jobs"])
    await Runner(state, value).run(run)


def test_processing_monitor_samples_during_extraction_and_finishes_before_report(tmp_path, monkeypatch):
    active = False
    observed = []
    async def extract(*args, **kwargs):
        nonlocal active
        active = True
        await asyncio.sleep(.35)
        active = False
        return json.loads((ROOT / "fixtures/article.json").read_text())
    def snapshot(path):
        observed.append(active)
        return {"at": len(observed), "process_tree": {"rss_bytes": 900 if active else 10, "cpu_seconds": 1, "groups": {}}}
    async def scenario():
        state = State(tmp_path)
        try:
            await prepare(state, config(tmp_path), "monitor")
            monkeypatch.setattr("bench.processing.extract", extract)
            monkeypatch.setattr("bench.metrics.snapshot", snapshot)
            result = await process_run(state, "monitor")
            assert any(observed)
            assert result["resource_summary_by_phase"]["processing"]["peak_tree_rss_bytes"] == 900
            assert result["resource_samples"][-1]["phase"] == "processing"
            calls = len(observed)
            await asyncio.sleep(.3)
            assert len(observed) == calls  # No monitor survives the processing call.
        finally: state.close()
    asyncio.run(scenario())


def test_processing_monitor_cleans_up_on_cancellation(tmp_path, monkeypatch):
    entered = asyncio.Event()
    async def blocked(*args, **kwargs):
        entered.set()
        await asyncio.Event().wait()
    async def scenario():
        state = State(tmp_path)
        try:
            await prepare(state, config(tmp_path), "cancel")
            monkeypatch.setattr("bench.processing.extract", blocked)
            task = asyncio.create_task(process_run(state, "cancel"))
            await entered.wait()
            task.cancel()
            with pytest.raises(asyncio.CancelledError): await task
            row = state.db.execute("SELECT kind,detail FROM events WHERE run='cancel' ORDER BY id DESC LIMIT 1").fetchone()
            assert row["kind"] == "resource_final" and json.loads(row["detail"])["phase"] == "processing"
            count = state.db.execute("SELECT COUNT(*) FROM events").fetchone()[0]
            await asyncio.sleep(.3)
            assert state.db.execute("SELECT COUNT(*) FROM events").fetchone()[0] == count
        finally: state.close()
    asyncio.run(scenario())


def test_campaign_includes_repetitions_failures_unresolved_spend_and_idle_server_cost(tmp_path, capsys):
    async def scenario():
        state = State(tmp_path)
        try:
            await prepare(state, config(tmp_path, 3), "pilot")
            await process_run(state, "pilot")
            jobs = state.jobs("pilot")
            # Make one repetition fail; its charge must remain in total expenditure.
            result = jobs[-1]["result"]
            result["steps"][0].update(status="failed", extractions={})
            state.set_job(jobs[-1]["id"], "complete", result)
            state.db.execute("UPDATE spend SET actual=1")
            other = plan(config(tmp_path))
            state.create_run("pending", {key: value for key, value in other.items() if key != "jobs"}, other["jobs"])
            state.set_job("pending-000000", "uncertain")
            state.reserve("pending-000000__direct", "provider", 4, {"total_usd": 100, "providers": {"provider": 100}})
            first = report_campaign(state, 10, "Dedicated VPS campaign allocation, including idle days")
            assert first["provider_actual_usd"] == 3 and first["provider_unreconciled_reserved_usd"] == 4
            assert first["usable_acquisitions"] == 2 and first["cost_status"] == "UNRESOLVED_JOBS"
            assert first["cost_per_usable_acquisition_usd"] is None
            state.set_job("pending-000000", "complete", {"steps": []})
            assert report_campaign(state, 10, "invoice")["cost_status"] == "UNRECONCILED_PROVIDER_CHARGES"
            state.reconcile("pending-000000__direct", 2, "Provider invoice")
            final = report_campaign(state, 10, "invoice")
            assert final["known_total_usd"] == 15 and final["cost_per_usable_acquisition_usd"] == 7.5
        finally: state.close()
    asyncio.run(scenario())
    assert main(["campaign-costs", "--data-dir", str(tmp_path), "--server-total-usd", "10", "--server-cost-evidence", "invoice"]) == 0
    assert json.loads(capsys.readouterr().out)["cost_status"] == "RECONCILED"
    assert (tmp_path / "reports/campaign-costs/report.md").exists()


@pytest.mark.parametrize("amount,evidence", [(float("nan"), "invoice"), (-1, "invoice"), (10, " ")])
def test_campaign_rejects_invalid_server_accounting(tmp_path, amount, evidence):
    state = State(tmp_path)
    try:
        with pytest.raises(ValueError): report_campaign(state, amount, evidence)
    finally: state.close()
