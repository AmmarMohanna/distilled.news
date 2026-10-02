"""Plan by default. Explicit execution delegates to the existing bounded benchmark.

This launcher never enables routes, expands budgets, retries acquisition, or
turns provider output into independent gold references.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def read_campaign(path):
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("version") != 1:
        raise ValueError("Unsupported campaign version")
    families = manifest["families"]
    if len({f["id"] for f in families}) != len(families):
        raise ValueError("Duplicate family ID")
    for family in families:
        for key in ("targets", "items_per_target"):
            if type(family[key]) is not int or family[key] < 1:
                raise ValueError("Positive integer sample sizes required")
    return manifest


def executable_config(manifest_path, family):
    if family.get("status") != "ready" or family.get("blockers") or not family.get("config"):
        raise ValueError("Family is not ready; resolve and document its blockers first")
    path = (manifest_path.parent / family["config"]).resolve()
    expected = family.get("config_sha256")
    if not expected or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError("Freeze the reviewed config SHA-256 before execution")
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=ROOT / "configs/combined-campaign.json")
    parser.add_argument("--execute", metavar="FAMILY", help="Explicitly execute one ready family")
    parser.add_argument("--run-id", help="Stable run ID; existing benchmark state prevents duplicate creation")
    args = parser.parse_args()
    path = args.manifest.resolve()
    manifest = read_campaign(path)
    families = manifest["families"]
    if not args.execute:
        print(json.dumps({"campaign": manifest["campaign_id"], "live_requests": 0,
            "planned_items_before_overlap": sum(f["targets"] * f["items_per_target"] for f in families),
            "review_target": manifest["independent_review_target"], "stage3_days": manifest["stage3_days"],
            "families": families}, indent=2))
        return 0
    if not args.run_id:
        parser.error("--execute requires --run-id")
    family = next((f for f in families if f["id"] == args.execute), None)
    if family is None:
        raise ValueError("Unknown family")
    config_path = executable_config(path, family)
    sys.path.insert(0, str(ROOT))
    from bench.config import load, identifier
    config = load(config_path)
    identifier(args.run_id)
    if len(config["targets"]) != family["targets"] or config["repetitions"] != 1:
        raise ValueError("Controlled sample must match the roster with one repetition")
    if not any(r["enabled"] for r in config["routes"]):
        raise ValueError("No enabled routes")
    for command in ("preflight", "validate-gold"):
        subprocess.run([sys.executable, "-m", "bench", command, "--config", str(config_path)], cwd=ROOT, check=True)
    subprocess.run([sys.executable, "-m", "bench", "run", "--config", str(config_path), "--run-id", args.run_id], cwd=ROOT, check=True)
    subprocess.run([sys.executable, "-m", "bench", "process", "--data-dir", config["data_dir"], "--run-id", args.run_id], cwd=ROOT, check=True)
    print("Capture/processing finished. Review job states and quality labels; this is not an automatic quality PASS.")
    print(str(Path(config["data_dir"]) / "reports" / args.run_id / "report.md"))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
