"""Controls that decide whether a comparison can pick a winner: windows, costs, resources and server readiness."""
import asyncio
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

import pytest

from bench import metrics
from bench.cli import main, preflight, scheduled_rounds, server_check
from bench.config import load
from bench.faults import run_faults
from bench.runner import Runner, plan
from bench.score import score_article
from bench.state import State
from bench.validator import article_validation

ROOT = Path(__file__).resolve().parents[1]


def demo(tmp_path, **changes):
    config = load(ROOT / "configs/offline-demo.json")
    config.update(data_dir=str(tmp_path / "data"), **changes)
    config["limits"] |= {"min_free_disk_bytes": 0, "domain_interval_seconds": 0}
    return config


@pytest.mark.parametrize("fields,accepted", [
    ({"short_news": True, "published_at": "2026-09-01T09:00:00Z"}, True),
    ({"short_news": True}, False),  # Declared by the target list, unsupported by the page.
    ({"published_at": "2026-09-01T09:00:00Z"}, False),
])
def test_short_news_threshold_needs_page_evidence(fields, accepted):
    result = article_validation({"title": "Headline", "body": "x" * 120} | fields)
    assert result["accepted"] is accepted
    assert result["short_news_applied"] is accepted and result["body_minimum"] == (80 if accepted else 250)


def test_extractor_native_dates_stay_comparable_after_metadata_enrichment():
    gold = json.loads((ROOT / "fixtures/article.gold.json").read_text(encoding="utf-8"))
    article = json.loads((ROOT / "fixtures/article.json").read_text(encoding="utf-8")) | {"title": gold["title"], "body": gold["body"]}
    day_only = score_article(article | {"extractor_metadata": {"published_at": "2026-09-01"},
        "metadata_provenance": {"published_at": {"source": "meta[article:published_time]"}}}, gold)
    assert day_only["date_correct"] and day_only["extractor_date_correct"] is False
    assert day_only["date_source"] == "meta[article:published_time]"
    exact = score_article(article | {"extractor_metadata": {"published_at": "2026-09-01T09:00:00Z"}}, gold)
    assert exact["extractor_date_correct"] is True
    assert score_article(article, gold)["extractor_date_correct"] is None


def fake_proc(root, processes, cpu=(100, 50)):
    for pid, (ppid, command, rss_pages, ticks) in processes.items():
        folder = root / str(pid)
        folder.mkdir()
        fields = ["S", str(ppid)] + ["0"] * 9 + [str(ticks), "0"]
        (folder / "stat").write_text(f"{pid} ({command}) " + " ".join(fields))
        (folder / "statm").write_text(f"{rss_pages * 2} {rss_pages} 0 0 0 0 0")
    (root / "stat").write_text("cpu  %d 0 0 %d 0 0 0 0\n" % cpu)


def test_process_tree_counts_node_and_chromium_descendants_but_not_unrelated_processes(tmp_path):
    fake_proc(tmp_path, {10: (1, "python3", 100, 200), 11: (10, "node", 50, 100), 12: (11, "unshare", 1, 0),
                         13: (12, "chrome", 400, 300), 14: (13, "chrome (renderer)", 200, 100), 99: (1, "postgres", 999, 999)})
    tree = metrics.process_tree(10, tmp_path, clock_ticks=100, page_size=4096)
    assert tree["processes"] == 5
    assert tree["groups"]["chromium"] == {"processes": 2, "rss_bytes": 600 * 4096, "cpu_seconds": 4.0}
    assert tree["groups"]["node"]["rss_bytes"] == 50 * 4096 and tree["groups"]["python"]["cpu_seconds"] == 2.0
    assert tree["rss_bytes"] == 751 * 4096


def test_resource_summary_reports_peaks_and_host_cpu():
    samples = [
        {"host_memory_bytes": {"MemAvailable": 3 * 1024**3, "SwapTotal": 10, "SwapFree": 10}, "host_cpu_jiffies": {"busy": 0, "total": 0},
         "process_tree": {"rss_bytes": 100, "cpu_seconds": 1, "groups": {"chromium": {"rss_bytes": 60}}}},
        {"host_memory_bytes": {"MemAvailable": 1024**3, "SwapTotal": 10, "SwapFree": 4}, "host_cpu_jiffies": {"busy": 95, "total": 100},
         "process_tree": {"rss_bytes": 300, "cpu_seconds": 5, "groups": {"chromium": {"rss_bytes": 250}, "node": {"rss_bytes": 20}}}},
    ]
    summary = metrics.summarize(samples)
    assert summary["peak_tree_rss_bytes"] == 300 and summary["peak_chromium_rss_bytes"] == 250 and summary["peak_node_rss_bytes"] == 20
    assert summary["min_available_memory_bytes"] == 1024**3 and summary["peak_swap_used_bytes"] == 6
    assert summary["max_host_cpu_fraction"] == 0.95


@pytest.mark.parametrize("sample,previous,reason", [
    ({"host_memory_bytes": {"MemAvailable": 100}}, None, "low_available_memory"),
    ({"host_cpu_jiffies": {"busy": 99, "total": 100}}, {"host_cpu_jiffies": {"busy": 0, "total": 0}}, "high_host_cpu"),
])
def test_sustained_capacity_pressure_stops_new_dispatch_for_run_and_campaign(tmp_path, monkeypatch, sample, previous, reason):
    config = demo(tmp_path, mode="live", parent_run="campaign")
    config["limits"] |= {"pressure_seconds": 300}
    state = State(Path(config["data_dir"]))
    try:
        for run in ("campaign", "round"): state.create_run(run, {"config": config}, [])
        runner = Runner(state, config, creds={}, http=SimpleNamespace())
        clock = iter([1000.0, 1200.0, 1300.0])
        monkeypatch.setattr("bench.runner.time.monotonic", lambda: next(clock))
        since = runner.pressure("round", previous, sample, None)
        assert since == 1000.0 and not state.stopped("round")
        assert runner.pressure("round", previous, sample, since) == since  # 200 seconds: still waiting.
        assert runner.pressure("round", previous, sample, since) is None
        assert state.stopped("round") and state.stopped("campaign")
        event = json.loads(state.db.execute("SELECT detail FROM events WHERE kind='capacity_stop'").fetchone()[0])
        assert event["reasons"] == [reason] and event["sustained_seconds"] == 300
        assert runner.pressure("round", previous, sample, None) is None  # Already stopped: no repeated events.
        assert state.db.execute("SELECT count(*) FROM events WHERE kind='capacity_stop'").fetchone()[0] == 1
    finally: state.close()


def test_recovered_capacity_resets_the_pressure_clock_and_offline_runs_ignore_it(tmp_path):
    config = demo(tmp_path, mode="live")
    state = State(Path(config["data_dir"]))
    try:
        state.create_run("round", {"config": config}, [])
        runner = Runner(state, config, creds={}, http=SimpleNamespace())
        assert runner.pressure("round", None, {"host_memory_bytes": {"MemAvailable": 10 * 1024**3}}, 1.0) is None
        runner.config = config | {"mode": "offline"}
        assert runner.pressure("round", None, {"host_memory_bytes": {"MemAvailable": 1}}, 1.0) is None
    finally: state.close()


def test_fault_smoke_gate_covers_main_fault_classes_without_network():
    result = asyncio.run(run_faults())
    assert result["passed"], [check for check in result["checks"] if not check["passed"]]
    cases = {check["case"] for check in result["checks"]}
    assert {"redirect_loop", "redirect_to_private_address", "oversized_body", "compressed_expansion", "http_429", "http_503",
            "http_200_challenge_page", "doctype_feed_accepted", "entity_declaration_refused"} <= cases
    assert result["network_calls"] == 0 and "pytest" in result["scope"]


def test_schedule_loads_round_specific_references(tmp_path):
    async def scenario():
        config = demo(tmp_path, extractors=["fixture"])
        config["routes"] = [route for route in config["routes"] if route["id"] == "direct"]
        config["chains"] = []
        config["targets"] = [{"id": "article", "kind": "article", "input": "https://example.com/article", "routes": ["direct"],
                              "fixture": str(ROOT / "fixtures/article.json"), "reference": str(ROOT / "fixtures/article.gold.json")}]
        gold = json.loads((ROOT / "fixtures/article.gold.json").read_text(encoding="utf-8"))
        references = tmp_path / "references"
        (references / "round-001").mkdir(parents=True)
        (references / "round-001/article.json").write_text(json.dumps(gold | {"title": "Round one reference"}), encoding="utf-8")
        config["schedule"] = {"rounds": 2, "interval_seconds": 1, "references_dir": str(references)}
        state = State(Path(config["data_dir"]))
        try:
            await scheduled_rounds(config, "week", state)
            assert state.jobs("week-r000")[0]["spec"]["reference"]["title"] == gold["title"]
            assert state.jobs("week-r001")[0]["spec"]["reference"]["title"] == "Round one reference"
            events = [json.loads(row[0]) for row in state.db.execute("SELECT detail FROM events WHERE kind='round_references_loaded' ORDER BY id")]
            assert events[0]["references"] == {} and list(events[1]["references"]) == ["article"]
        finally: state.close()
    asyncio.run(scenario())


def test_attach_reference_reports_the_round_window_it_must_match(tmp_path, capsys):
    config = demo(tmp_path)
    target = next(target for target in config["targets"] if target["kind"] == "telegram")
    config["targets"] = [target | {"routes": ["telegram_public"]}]
    state = State(Path(config["data_dir"]))
    manifest = plan(config)
    state.create_run("round", {key: value for key, value in manifest.items() if key != "jobs"}, manifest["jobs"])
    state.close()
    stale = tmp_path / "stale.json"
    stale.write_text(json.dumps({"complete_window": True, "items": [{"id": "101"}]}), encoding="utf-8")
    assert main(["attach-reference", "--data-dir", config["data_dir"], "--run-id", "round", "--target-id", target["id"], "--reference", str(stale)]) == 0
    output = json.loads(capsys.readouterr().out)
    assert output["collection_window"]["start_time"].startswith("2026-09-01T00:00:00")
    assert output["reference_window_error"] == "reference_window_missing"


def test_preflight_requires_server_cost_and_round_references(tmp_path):
    config = demo(tmp_path, mode="live")
    config["routes"] = [route | {"enabled": False} for route in config["routes"]]
    checks = {check.get("check"): check for check in preflight(config)["checks"]}
    assert checks["server_cost"]["status"] == "NOT_READY"
    config["costs"] = {"server_monthly_usd": 20}
    assert "server_cost" not in {check.get("check") for check in preflight(config)["checks"]}
    config["schedule"] = {"rolling_window_hours": 24}
    rolling = [check for check in preflight(config)["checks"] if check.get("check") == "reference_window"]
    assert rolling and all(check["status"] == "NOT_READY" for check in rolling)


def test_preflight_only_requires_namespaces_for_the_isolated_browser(tmp_path, monkeypatch):
    monkeypatch.setattr("bench.routes.browser_playwright.isolation_available", lambda: False)
    config = demo(tmp_path, mode="live", costs={"server_monthly_usd": 20})
    config["routes"] = [route for route in config["routes"] if route["adapter"] == "browser_playwright"]
    config["targets"] = [{"id": "article", "kind": "article", "input": "https://example.com/article", "routes": ["browser", "browser_standard"]}]
    checks = {check["route"]: check for check in preflight(config)["checks"] if check.get("route")}
    assert any("unshare" in issue for issue in checks["browser"]["issues"])
    assert not any("unshare" in issue for issue in checks["browser_standard"]["issues"])


def test_server_check_skips_chromium_when_namespaces_fail_and_sends_no_acquisition_requests(tmp_path, monkeypatch):
    def fake_run(argv, **kwargs):
        outputs = {"node": (0, "v24.1.0"), "unshare": (1, "unshare: write failed /proc/self/uid_map: Operation not permitted"), "timedatectl": (0, "yes")}
        code, text = outputs[argv[0]]
        return subprocess.CompletedProcess(argv, code, stdout=text if code == 0 else "", stderr="" if code == 0 else text)
    monkeypatch.setattr(subprocess, "run", fake_run)
    monkeypatch.setitem(sys.modules, "playwright.async_api", None)  # Any Chromium launch attempt would fail loudly.
    config = demo(tmp_path, mode="live", costs={"server_monthly_usd": 20})
    for route in config["routes"]: route["enabled"] = route["id"] == "browser"
    result = asyncio.run(server_check(config))
    checks = {check["check"]: check for check in result["checks"]}
    assert checks["user_network_namespace"]["status"] == "NOT_READY" and "Operation not permitted" in checks["user_network_namespace"]["detail"]
    assert "chromium_launch_isolated" not in checks
    assert checks["node_24_plus"]["status"] == "READY" and checks["server_cost_configured"]["status"] == "READY"
    assert checks["clock_synchronized"]["status"] == "READY"
    assert not result["ready"] and result["acquisition_requests"] == 0
