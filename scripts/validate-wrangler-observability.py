"""Offline validation against the lockfile-installed Wrangler observability schema."""
import json
from pathlib import Path
import tomllib
ROOT = Path(__file__).resolve().parents[1]
schema = json.loads((ROOT / "apps/worker/node_modules/wrangler/config-schema.json").read_text(encoding="utf-8"))["definitions"]["Observability"]
def validate(value, rule, location):
    kind = rule.get("type")
    expected = {"object": dict, "array": list, "boolean": bool, "number": (int, float), "string": str}
    if kind in expected:
        assert isinstance(value, expected[kind]), location + ": wrong type"
    if kind == "object":
        allowed = rule.get("properties", {})
        if rule.get("additionalProperties") is False:
            assert not set(value) - set(allowed), location + ": unsupported key"
        for key, item in value.items():
            validate(item, allowed[key], location + "." + key)
    if kind == "array":
        for item in value:
            validate(item, rule["items"], location + "[]")
    if location.endswith("head_sampling_rate"):
        assert type(value) in (float, int) and 0 <= value <= 1, location + ": sampling range"
for environment, base in [("staging", "wrangler.staging.toml"), ("production", "wrangler.toml")]:
    fragment = (ROOT / ("ops/observability/wrangler." + environment + ".fragment.toml")).read_text(encoding="utf-8")
    parsed = tomllib.loads(fragment)
    assert set(parsed) == {"observability"}
    merged = tomllib.loads((ROOT / "apps/worker" / base).read_text(encoding="utf-8") + "\n" + fragment)
    validate(merged["observability"], schema, environment + ".observability")
    for signal in ("logs", "traces"):
        config = merged["observability"][signal]
        assert config["persist"] is False
        assert config["destinations"] == ["distilled-" + environment + "-" + signal]
print("2 environment fragments valid against installed Wrangler schema; merged TOML parses; no deployment")
