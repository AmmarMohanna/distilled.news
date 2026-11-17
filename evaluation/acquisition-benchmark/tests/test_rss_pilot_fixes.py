import asyncio

import pytest

from bench.processing import normalize
from bench.score import score_source

STAMP = "2026-09-22T10:00:00Z"
TARGET = {"id": "feed", "kind": "rss", "input": "https://example.com/feed"}


def run_feed(body, parser="feedparser", **kwargs):
    payload = ('<rss xmlns:media="http://search.yahoo.com/mrss/" '
               'xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>'
               + body + '</channel></rss>').encode()
    return asyncio.run(normalize(payload, TARGET,
        {"adapter": "rss", "settings": {"parser": parser}}, STAMP, **kwargs))


def test_summary_wins_over_media_caption_and_full_content():
    result = run_feed('''<item><title>Fuel policy</title><guid>one</guid>
      <description>Government announces fuel tax measure.</description>
      <content:encoded><![CDATA[<p>Long article body</p>]]></content:encoded>
      <media:content url="https://example.com/photo.jpg" medium="image">
        <media:description>Prime minister photographed in Paris.</media:description>
      </media:content><pubDate>Tue, 22 Sep 2026 09:00:00 GMT</pubDate></item>''')
    assert result["items"][0]["text"] == "Fuel policy Government announces fuel tax measure."


def test_media_rss_and_enclosures_are_mapped_and_deduplicated():
    result = run_feed('''<item><title>Images</title>
      <media:thumbnail url="https://example.com/photo?w=140&amp;q=85" />
      <media:content url="https://example.com/video" type="video/mp4" />
      <enclosure url="https://example.com/photo?w=140&amp;q=85" type="image/jpeg" />
      <enclosure url="https://example.com/audio" type="audio/mpeg" />
      </item>''')
    assert {m["url"]: m["type"] for m in result["items"][0]["media"]} == {
        "https://example.com/photo?w=140&q=85": "photo",
        "https://example.com/video": "video", "https://example.com/audio": "audio"}
    assert len(result["items"][0]["media"]) == 3


def test_content_only_feed_still_has_body():
    result = run_feed('''<item><title>Story</title>
      <content:encoded><![CDATA[<p>Full content without a summary.</p>]]></content:encoded>
      </item>''')
    assert "Full content without a summary." in result["items"][0]["text"]


def test_atom_updated_date_fallback_keeps_provenance_and_prefers_published():
    payload = b'''<feed xmlns="http://www.w3.org/2005/Atom"><title>Updates</title>
      <entry><id>one</id><title>Updated only</title><updated>2026-09-26T06:08:00Z</updated></entry>
      <entry><id>two</id><title>Both dates</title><published>2026-09-25T01:00:00Z</published>
      <updated>2026-09-26T06:08:00Z</updated></entry>
      <entry><id>three</id><title>No date</title></entry></feed>'''
    result = asyncio.run(normalize(payload, TARGET,
        {"adapter": "rss", "settings": {"parser": "feedparser"}}, STAMP))
    one, two, three = result["items"]
    assert one["published_at"] == "2026-09-26T06:08:00+00:00"
    assert one["date_source"] == "updated"
    assert two["published_at"] == "2026-09-25T01:00:00+00:00"
    assert two["date_source"] == "published"
    assert three["published_at"] is None and three["date_source"] is None


@pytest.mark.parametrize("parser", ["baseline", "feedparser"])
@pytest.mark.parametrize("maximum", [1, 3, 5])
def test_feed_cap_preserves_order_and_reports_intentional_omissions(parser, maximum):
    body = ''.join(f'''<item><title>Story {i}</title><guid>{i}</guid>
      <link>https://example.com/{i}</link><pubDate>Tue, 22 Sep 2026 09:00:00 GMT</pubDate>
      </item>''' for i in range(3))
    result = run_feed(body, parser, max_items=maximum)
    assert [i["url"] for i in result["items"]] == [f"https://example.com/{i}" for i in range(min(maximum, 3))]
    assert result["item_limit"] == {"maximum": maximum, "available": 3,
                                    "returned": min(maximum, 3), "omitted": max(0, 3-maximum)}
    score = score_source(result, None, TARGET)
    assert score["item_limit"] == result["item_limit"]
    assert score["normalization_dropped"] == 0
    assert score["label"] == "SOURCE_UNVERIFIED"
