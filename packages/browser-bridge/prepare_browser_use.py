"""Prepare audited upstream sources with patched runtime dependency pins."""

import hashlib
import io
import shutil
import sys
import tarfile
from contextlib import closing
from http.client import HTTPSConnection
from pathlib import Path


def prepare(
    directory: Path, source: str, version: str, path: str, digest: str, pins: dict[str, str], revision: int = 1
) -> None:
    with closing(HTTPSConnection("files.pythonhosted.org", timeout=60)) as connection:
        connection.request("GET", path)
        with connection.getresponse() as response:
            if response.status != 200:
                raise ValueError(f"Download failed for {source} {version}: HTTP {response.status}")
            archive = response.read()
    if hashlib.sha256(archive).hexdigest() != digest:
        raise ValueError(f"Unexpected source digest for {source} {version}")
    source_directory = (directory / f"{source}-{version}").resolve()
    source_directory.mkdir(parents=True)
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as package:
        for member in package:
            target = (directory / member.name).resolve()
            if not target.is_relative_to(source_directory):
                raise ValueError(f"Source archive member is outside {source_directory.name}")
            if member.isdir():
                continue
            if not member.isfile():
                raise ValueError(f"Unexpected source archive member type: {member.name}")
            target.parent.mkdir(parents=True, exist_ok=True)
            with package.extractfile(member) as data, target.open("xb") as output:
                shutil.copyfileobj(data, output)

    manifest = source_directory / "pyproject.toml"
    content = manifest.read_text(encoding="utf-8")
    for old, new in {f'version = "{version}"': f'version = "{version}+distilled.{revision}"', **pins}.items():
        if old not in content:
            raise ValueError(f"Expected pin is missing from {manifest}: {old}")
        content = content.replace(old, new)
    manifest.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    destination = Path(sys.argv[1])
    prepare(
        destination,
        "browser_harness",
        "0.1.13",
        "/packages/7f/fe/59ab493e7cf76731a7f5aabae3821eea6ea82a628c14c30e7aed48adc362/browser_harness-0.1.13.tar.gz",
        "284dc547a042c309feafd9a9f4a74b2a8651b7963ea3ac6cb2f2d64889f6a8f3",
        {"pillow==12.3.0": "pillow==13.0.0"},
    )
    prepare(
        destination,
        "browser_use",
        "0.13.14",
        "/packages/a2/eb/6b9183ec63541c2c7c1a87c30d142806e7fe3a95748ce95f8e37dcab2335/browser_use-0.13.14.tar.gz",
        "9bb2f3d7ea215bf67b415c8e6e546413a3712ac5ea775b223b452189f4582d9d",
        {
            "browser-harness==0.1.13": "browser-harness==0.1.13+distilled.1",
            "anyio==4.12.1": "anyio==4.14.2",
            "mcp==2.1.1": "mcp==2.2.0",
            "pillow==12.3.0": "pillow==13.0.0",
            "pypdf==6.16.2": "pypdf==6.21.4",
        },
        revision=2,
    )
