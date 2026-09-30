import asyncio
import json

import pytest

from bench.processing import normalize, telethon_fields


def test_links_use_utf16_offsets_and_preserve_hidden_links():
    text = "\U0001f600 https://example.com read more"
    result = telethon_fields({"message": text, "entities": [
        {"_": "MessageEntityUrl", "offset": 3, "length": 19},
        {"_": "MessageEntityTextUrl", "url": "https://t.me/telegram/1"},
        {"_": "MessageEntityTextUrl", "url": "https://example.com"},
        {"_": "MessageEntityTextUrl", "url": "javascript:alert(1)"},
        {"_": "MessageEntityUrl", "offset": -1, "length": 20}
    ]})
    assert result["links"] == ["https://example.com", "https://t.me/telegram/1"]
    assert result["media"] == []


@pytest.mark.parametrize("attribute,expected", [
    ({"_": "DocumentAttributeVideo"}, "video"),
    ({"_": "DocumentAttributeAnimated"}, "animation"),
    ({"_": "DocumentAttributeAudio", "voice": True}, "voice"),
    ({"_": "DocumentAttributeAudio", "voice": False}, "audio"),
    ({"_": "DocumentAttributeFilename"}, "document"),
])
def test_document_references_do_not_invent_download_urls(attribute, expected):
    raw = {"_": "MessageMediaDocument", "document": {"id": 123, "attributes": [attribute]}}
    result = telethon_fields({"media": raw})
    assert result["media"] == [{"type": expected, "telegram_id": "123", "requires_api_download": True}]
    assert result["raw_media"] == raw


def test_photos_and_previews_are_separate():
    assert telethon_fields({"media": {"_": "MessageMediaPhoto", "photo": {"id": 42}}})["media"][0]["type"] == "photo"
    result = telethon_fields({"media": {"_": "MessageMediaWebPage", "webpage": {"url": "https://example.com", "title": "Preview"}}})
    assert result["media"] == []
    assert result["link_previews"] == [{"url": "https://example.com", "title": "Preview"}]


def test_unknown_media_remains_visible():
    raw = {"_": "MessageMediaPoll", "poll": {"id": 1}}
    result = telethon_fields({"media": raw})
    assert result["media"][0]["unresolved"] is True
    assert result["raw_media"] == raw


def test_normalization_integrates_fields_without_losing_text_or_date():
    row = {"id": 1, "message": "Read this", "date": "2026-09-23T10:00:00Z",
           "entities": [{"_": "MessageEntityTextUrl", "url": "https://example.com"}]}
    result = asyncio.run(normalize(json.dumps([row]).encode(),
        {"id": "channel", "input": "telegram"}, {"adapter": "telethon", "settings": {}}, row["date"]))
    item = result["items"][0]
    assert item["links"] == ["https://example.com"]
    assert item["media"] == []
    assert item["text"] == "Read this"
    assert item["url"] == "https://t.me/telegram/1"
    assert item["published_at"].startswith("2026-09-23T10:00:00")
