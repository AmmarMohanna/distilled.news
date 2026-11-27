"""CI release checks. Cloudflare requests in this script only read state."""
import argparse
from collections import Counter
from html.parser import HTMLParser
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import tomllib
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "apps/worker"
MIGRATIONS = "apps/worker/migrations"
CONFIGS = {"ci-staging": "wrangler.ci-staging.jsonc", "production": "wrangler.production.jsonc"}
CI_STAGING_PLACEHOLDER = "00000000-0000-0000-0000-000000000000"
CI_STAGING_GENERATED = WORKER / "wrangler.ci-staging.generated.json"
URLS = {
    "ci-staging": "https://distilled-news-ci-staging.distillednews-platform.workers.dev",
    "production": "https://distilled.news",
}
SECURITY_WORKFLOWS = tuple(
    f"security-{name}.yml" for name in ("codeql", "gitleaks", "semgrep", "trivy", "container-validation")
)
INFRA_PATHS = (
    "apps/worker/wrangler.ci-staging.jsonc", "apps/worker/wrangler.production.jsonc",
    "evaluation/briefing-quality/worker", "apps/agentops-collector",
    "apps/worker/browser-container.Dockerfile", "packages/browser-bridge",
    "scripts/source-execution-server.mjs", "scripts/source-execution.mjs",
    "scripts/source-execution.py", "scripts/source-execution.requirements.txt",
    "ops/observability",
)
SHA = re.compile(r"[0-9a-f]{40}")
ASSET = re.compile(r"/assets/[a-zA-Z0-9_.-]+\.(?:js|css)")
BUILD = ROOT / "apps/web/dist"


class ReleaseError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise ReleaseError(message)


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def load_configs():
    return {target: json.loads((WORKER / path).read_text(encoding="utf-8"))
            for target, path in CONFIGS.items()}


def validate_configs(configs):
    resources = {}
    for target, config in configs.items():
        staging = target == "ci-staging"
        worker = f"distilled-news-{target}"
        require(config["name"] == worker, f"{target}: unexpected Worker")
        require(config["main"] == ("src/staging.ts" if staging else "src/index.ts"),
                f"{target}: unexpected entry point")
        require(not set(config) & {"env", "build", "containers", "migrations", "services", "workflows"},
                f"{target}: custom builds, nested environments and additional runtimes require a separate release")
        require(not config.get("durable_objects", {}).get("bindings"), f"{target}: Durable Object changes need a separate release")
        require(config["preview_urls"] is False, f"{target}: previews must be off")
        require(config["routes"] == ([] if staging else [{"pattern": "distilled.news", "custom_domain": True}]),
                f"{target}: unexpected routes")
        require(config["assets"]["directory"] == "../web/dist" and config["assets"]["binding"] == "ASSETS"
                and config["assets"]["run_worker_first"] is True, f"{target}: unexpected assets binding")
        variables = config["vars"]
        require(all(variables[k] == URLS[target] for k in ("PUBLIC_WEB_BASE_URL", "PUBLIC_API_BASE_URL")),
                f"{target}: unexpected public URL")
        db, = config["d1_databases"]
        require(db["binding"] == "DB" and db["database_name"] == worker and db["migrations_dir"] == "migrations"
                and not {"migrations_table", "preview_database_id"} & db.keys(),
                f"{target}: unexpected D1 binding or ledger")
        require(re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", db["database_id"]),
                f"{target}: invalid database ID")
        if staging:
            require(set(config) == {"name", "account_id", "main", "compatibility_date", "compatibility_flags",
                                    "workers_dev", "preview_urls", "routes", "vars", "d1_databases", "assets",
                                    "observability", "secrets"} and config["workers_dev"] is True
                    and config["secrets"] == {"required": ["ADMIN_SESSION_SECRET"]},
                    "ci-staging: only the dedicated DB, frontend and authentication probe are allowed")
            require(set(variables) == {"CI_STAGING_READ_ONLY", "PUBLIC_WEB_BASE_URL", "PUBLIC_API_BASE_URL"}
                    and variables["CI_STAGING_READ_ONLY"] == "true", "ci-staging: read-only mode is required")
            resources[target] = {db["database_id"]}
            continue
        # Production already uses this rollout. Its exact creation-time boundary
        # is part of feed eligibility and must survive deployment byte-for-byte.
        rollout = {k: v for k, v in variables.items() if re.search(r"(^|_)V5(_|$)", k, re.I)}
        require(variables["BRIEFING_ENGINE"] == "v3" and variables.get("BRIEFING_SOURCE_BINDINGS_ENABLED") == "true"
                and rollout == {
                    "BRIEFING_V5_AUTO_PUBLICATION_ENABLED": "true",
                    "BRIEFING_V5_FEEDS_CREATED_FROM": "2026-11-26T19:54:12.096Z",
                    "BRIEFING_V5_GENERATION_PROFILE": "deepseek-flash-wafer",
                }, f"{target}: expected the approved V5 rollout on the source-bound V3 publication path")
        require(not {"RELEASE_SHA", "CI_STAGING_READ_ONLY"} & variables.keys(),
                f"{target}: release markers are set by CI")
        bucket, = config["r2_buckets"]
        require(bucket["binding"] == "RAW_ARCHIVE" and bucket["bucket_name"] == f"{worker}-raw",
                f"{target}: unexpected R2 binding")
        producers = {queue["queue"] for queue in config["queues"]["producers"]}
        consumers = {queue["queue"] for queue in config["queues"]["consumers"]}
        dead_letters = {queue["dead_letter_queue"] for queue in config["queues"]["consumers"]}
        expected = {f"{worker}-{suffix}" for suffix in ("processing", "collection", "acquisition", "v1")}
        require(producers == consumers == expected and dead_letters == {f"{q}-dlq" for q in expected},
                f"{target}: unexpected queue topology")
        resources[target] = {db["database_id"], bucket["bucket_name"], *expected, *dead_letters}
    integration = tomllib.loads((WORKER / "wrangler.staging.toml").read_text(encoding="utf-8"))
    integration_ids = {db["database_id"] for db in integration["d1_databases"]}
    require(resources["ci-staging"].isdisjoint(resources["production"] | integration_ids),
            "ci-staging shares a data resource with production or integration staging")
    require(resources["production"].isdisjoint(integration_ids), "production and integration staging share a data resource")


def migration_names():
    names = sorted(path.name for path in (ROOT / MIGRATIONS).iterdir())
    require(names and all(re.fullmatch(r"\d{4}_[a-zA-Z0-9_]+\.sql", name) for name in names),
            "Unexpected file in the application migration directory")
    return names


def validate_migration_diff(base, names):
    require(SHA.fullmatch(base) and base != "0" * 40, "Missing validation base SHA")
    changes = git("diff", "--no-renames", "--name-status", base, "HEAD", "--", MIGRATIONS).splitlines()
    if not changes:
        return
    old_paths = git("ls-tree", "-r", "--name-only", base, "--", MIGRATIONS).splitlines()
    highest = max((Path(old).name[:4] for old in old_paths), default="")
    for change in changes:
        status, path = change.split("\t", 1)
        name = Path(path).name
        require(status == "A" and name in names, f"Existing D1 migration changed: {path}")
        require(name[:4] > highest, f"New migration must append a new sequence number: {path}")
        require(sum(candidate[:4] == name[:4] for candidate in names) == 1,
                f"New migration collides with another sequence number: {path}")


class RejectRedirects(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def http(url, *, headers=None, data=None):
    request = Request(url, headers=headers or {}, data=data)
    try:
        response = build_opener(RejectRedirects()).open(request, timeout=15)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read(16 * 1024 * 1024 + 1)


def api(url, token, data=None):
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    status, _, body = http(url, headers=headers, data=None if data is None else json.dumps(data).encode())
    require(status == 200, f"API request failed with HTTP {status} ({url.split('?')[0]})")
    return json.loads(body)


def assert_current(sha, github):
    require(SHA.fullmatch(sha) and git("rev-parse", "HEAD") == sha, "Checked-out commit differs from the release SHA")
    ref = github("git/ref/heads/main")
    require(ref["object"]["sha"] == sha, "Release is stale. Start from the latest validated main run.")


def wait_for_security(sha, github, *, sleep=time.sleep, attempts=220):
    pending = set(SECURITY_WORKFLOWS)
    query = urlencode({"branch": "main", "event": "push", "head_sha": sha, "per_page": 1})
    for _ in range(attempts):
        assert_current(sha, github)
        for workflow in sorted(pending):
            result = github(f"actions/workflows/{workflow}/runs?{query}")["workflow_runs"]
            if not result:
                continue
            run = result[0]
            require(run["head_sha"] == sha and run["head_branch"] == "main" and run["event"] == "push",
                    f"{workflow}: unexpected workflow run")
            if run["status"] == "completed":
                require(run["conclusion"] == "success", f"{workflow} concluded {run['conclusion']}: {run['html_url']}")
                print(f"{workflow}: {run['html_url']}", flush=True)
                pending.remove(workflow)
        if not pending:
            return
        sleep(30)
    raise ReleaseError("Timed out waiting for: " + ", ".join(sorted(pending)))


def check_migration_ledger(expected, results):
    require(len(results) == 1 and results[0]["success"] is True, "Unable to verify D1 migration ledger")
    applied = Counter(row["name"] for row in results[0]["results"])
    missing = sorted((Counter(expected) - applied).elements())
    unexpected = sorted((applied - Counter(expected)).elements())
    require(not missing and not unexpected,
            f"D1 ledger differs; pending: {missing}; unexpected/duplicate: {unexpected}. See the migration runbook.")


def check_infra_baseline(baseline, sha):
    require(SHA.fullmatch(baseline), "Set RELEASE_INFRA_SHA after verifying infrastructure and companions")
    require(git("merge-base", baseline, sha) == baseline, "Infrastructure baseline must be an ancestor of the release")
    changed = git("diff", "--name-only", baseline, sha, "--", *INFRA_PATHS)
    require(not changed, f"Review and reconcile infrastructure or companion changes before releasing:\n{changed}")


def preflight(config, cf):
    db = config["d1_databases"][0]
    path = f"d1/database/{db['database_id']}"
    require(cf(path).get("name") == db["database_name"], "Live D1 database name does not match the deployment target")
    results = cf(f"{path}/query", {"sql": "SELECT name FROM d1_migrations"})
    check_migration_ledger(migration_names(), results)


class AssetLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = set()

    def handle_starttag(self, tag, attrs):
        link = dict(attrs).get({"script": "src", "link": "href"}.get(tag))
        if link and ASSET.fullmatch(link):
            self.paths.add(link)


def smoke(target, sha, get, directory=BUILD):
    def expect(path, status, media):
        actual, headers, body = get(path)
        require(actual == status, f"{path}: expected HTTP {status}, got {actual}")
        require(headers.get("Content-Type", "").lower().startswith(media), f"{path}: unexpected content type")
        require(len(body) <= 16 * 1024 * 1024, f"{path}: response exceeds the smoke check limit")
        return body

    health = json.loads(expect("/api/health/release", 200, "application/json"))
    require(health == {"status": "ok", "sha": sha, "readOnly": target == "ci-staging"},
            "Release health returned an unexpected SHA, status or staging mode")
    parser = AssetLinks()
    parser.feed(expect("/", 200, "text/html").decode())
    expected = AssetLinks()
    expected.feed((directory / "index.html").read_text(encoding="utf-8"))
    require(any(path.endswith(".js") for path in expected.paths) and parser.paths == expected.paths,
            "Public HTML references a different frontend build")
    for path in sorted(expected.paths):
        media = "text/css" if path.endswith(".css") else ("text/javascript", "application/javascript")
        body = expect(path, 200, media)
        require(hashlib.sha256(body).digest() == hashlib.sha256((directory / path[1:]).read_bytes()).digest(),
                f"{path}: deployed asset differs from the validated artifact")

    session = json.loads(expect("/api/auth/session", 200, "application/json"))
    require(session.get("authenticated") is False and "account" not in session
            and session.get("setupRequired") is (target == "ci-staging"),
            "Unexpected anonymous session or uninitialized account database")
    explore = json.loads(expect("/api/explore/feeds", 200, "application/json"))
    require(isinstance(explore.get("feeds"), list) and isinstance(explore.get("revision"), str),
            "Unexpected Explore API response")
    for path in ("/api/me/health", "/api/admin/accounts"):
        require(json.loads(expect(path, 401, "application/json")).get("error") == "unauthorized",
                f"{path}: unexpected anonymous response")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("validate", "security", "current", "preflight", "smoke"))
    parser.add_argument("value", nargs="?")
    args = parser.parse_args()
    if args.command == "validate":
        validate_configs(load_configs())
        names = migration_names()
        if args.value:
            validate_migration_diff(args.value, names)
        print(f"Validated two deployment targets and {len(names)} migration files")
        return

    sha = os.environ["GITHUB_SHA"]
    if args.command in {"security", "current"}:
        def github(path):
            repo = os.environ["GITHUB_REPOSITORY"]
            return api(f"https://api.github.com/repos/{repo}/{path}", os.environ["GH_TOKEN"])

        if args.command == "security":
            wait_for_security(sha, github)
        else:
            assert_current(sha, github)
        return

    target = args.value
    require(target in CONFIGS and SHA.fullmatch(sha), "Expected a known target and a full release SHA")
    if args.command == "preflight":
        configs = load_configs()
        if target == "ci-staging":
            database_id = os.environ["CI_STAGING_DATABASE_ID"]
            require(database_id != CI_STAGING_PLACEHOLDER, "Configure the dedicated CI staging D1 database ID")
            configs[target]["d1_databases"][0]["database_id"] = database_id
        validate_configs(configs)
        config = configs[target]
        require(os.environ["CLOUDFLARE_ACCOUNT_ID"] == config["account_id"], "Cloudflare account does not match the target")
        check_infra_baseline(os.environ["RELEASE_INFRA_SHA"], sha)

        def cf(path, data=None):
            account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
            result = api(f"https://api.cloudflare.com/client/v4/accounts/{account}/{path}",
                         os.environ["CLOUDFLARE_API_TOKEN"], data)
            require(result["success"] is True, f"Cloudflare rejected the preflight request ({path.split('?')[0]})")
            return result["result"]

        preflight(config, cf)
        if target == "ci-staging":
            CI_STAGING_GENERATED.write_text(json.dumps(config), encoding="utf-8")
        print(f"{target}: infrastructure baseline, target and D1 ledger verified")
        return

    def get(path):
        return http(f"{URLS[target]}{path}", headers={"Cache-Control": "no-cache", "Accept-Encoding": "identity"})

    for attempt in range(8):
        try:
            smoke(target, sha, get)
            print(f"{target}: release, assets, anonymous APIs and authentication boundaries verified")
            return
        except (ReleaseError, URLError, TimeoutError, ValueError) as error:
            print(f"Smoke attempt {attempt + 1}: {error}", flush=True)
            if attempt == 7:
                raise
            time.sleep(10)


if __name__ == "__main__":
    try:
        main()
    except (ReleaseError, URLError, TimeoutError, ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        sys.exit(f"Release check failed: {error}")
