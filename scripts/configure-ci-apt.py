"""Keep disposable Ubuntu CI browser setup off stalled HTTP mirror lists."""
import argparse
import os
from pathlib import Path
import re


def configure(apt_dir: Path) -> int:
    paths = [apt_dir / "sources.list", apt_dir / "apt-mirrors.txt"]
    sources_dir = apt_dir / "sources.list.d"
    if sources_dir.exists():
        paths.extend(sources_dir.glob("*.list"))
        paths.extend(sources_dir.glob("*.sources"))
    changed = 0
    for path in paths:
        if not path.is_file():
            continue
        original = path.read_text(encoding="utf-8")
        updated = original.replace(
            "mirror+file:/etc/apt/apt-mirrors.txt", "https://archive.ubuntu.com/ubuntu"
        )
        updated = re.sub(
            r"https?://azure\.archive\.ubuntu\.com/ubuntu/?",
            "https://archive.ubuntu.com/ubuntu/",
            updated,
        )
        updated = updated.replace("http://archive.ubuntu.com/ubuntu", "https://archive.ubuntu.com/ubuntu")
        updated = updated.replace("http://security.ubuntu.com/ubuntu", "https://security.ubuntu.com/ubuntu")
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed += 1
    config_dir = apt_dir / "apt.conf.d"
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / "99distilled-ci-network").write_text(
        'Acquire::http::Timeout "30";\nAcquire::https::Timeout "30";\nAcquire::Retries "1";\n',
        encoding="utf-8",
    )
    return changed


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apt-dir", type=Path, help="Explicit fixture directory for offline validation")
    args = parser.parse_args()
    if args.apt_dir is None and os.environ.get("GITHUB_ACTIONS") != "true":
        parser.error("System APT changes are restricted to GitHub Actions runners")
    print(f"Configured HTTPS Ubuntu CI mirrors ({configure(args.apt_dir or Path('/etc/apt'))} files updated)")
