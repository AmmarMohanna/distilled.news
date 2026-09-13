import asyncio

import pytest

from bench.extractors import extract
from bench.extractors.metadata import extract_metadata
from bench.score import date_matches, score_article


def test_explicit_metadata_preserves_dates_language_and_relative_canonical():
    fields, sources = extract_metadata('''<html lang="fr"><head><title>News &amp; analysis</title>
        <meta property="article:published_time" content="2026-09-01T09:00:00+03:00">
        <meta property="article:modified_time" content="2026-09-02T10:00:00+03:00">
        <meta property="og:site_name" content="Example Publisher"><link rel="canonical" href="../story">
        </head></html>''', "https://example.com/news/input")
    assert fields == {"title": "News & analysis", "language": "fr", "publisher": "Example Publisher",
        "published_at": "2026-09-01T09:00:00+03:00", "updated_at": "2026-09-02T10:00:00+03:00", "canonical_url": "https://example.com/story"}
    assert sources["published_at"]["source"] == "meta[article:published_time]"
    assert sources["canonical_url"]["raw"] == "../story"


def test_updated_and_arbitrary_time_elements_are_not_publication_dates():
    fields, _ = extract_metadata('<meta property="article:modified_time" content="2026-09-01T09:00:00Z"><time datetime="2026-09-01T09:00:00Z"></time>', "https://example.com")
    assert "published_at" not in fields and "updated_at" in fields
    assert extract_metadata("<link rel><meta name><time itemprop></time>", "https://example.com")[0] == {}


@pytest.mark.parametrize("value", ["not-a-date", "2026-99-99", ""])
def test_invalid_dates_do_not_mask_a_later_explicit_publication_date(value):
    fields, _ = extract_metadata(f'<meta property="article:published_time" content="{value}"><time itemprop="datePublished" datetime="2026-09-01"></time>', "https://example.com")
    assert fields["published_at"] == "2026-09-01"
    assert not date_matches(fields["published_at"], "2026-09-01T09:00:00Z")


@pytest.mark.parametrize("url", ["javascript:alert(1)", "file:///tmp/story", "https://user:secret@example.com/story", "http://[invalid"])
def test_unusable_canonical_metadata_is_not_accepted(url):
    fields, _ = extract_metadata(f'<link rel="canonical" href="{url}">', "https://example.com")
    assert "canonical_url" not in fields


def test_both_real_extractors_preserve_precise_publication_evidence():
    from pathlib import Path
    import json
    root = Path(__file__).resolve().parents[1]
    payload = (root / "fixtures/article.html").read_bytes()
    gold = json.loads((root / "fixtures/article.gold.json").read_text())
    async def scenario():
        for extractor in ("trafilatura", "readability"):
            article = await extract(payload, {"input": "https://example.com/library"}, extractor, "2026-09-03T12:00:00Z")
            assert article["published_at"] == "2026-09-01T09:00:00Z"
            assert article["metadata_provenance"]["published_at"]["source"] == "meta[article:published_time]"
            assert article["extractor_metadata"]["published_at"]
            assert score_article(article, gold)["label"] == "PASS"
    asyncio.run(scenario())
