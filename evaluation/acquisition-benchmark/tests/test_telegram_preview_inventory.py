import asyncio

from bench import processing


def test_landing_page_does_not_establish_empty_channel(monkeypatch):
    async def isolated(*args):
        return {"items": [], "issues": []}
    monkeypatch.setattr(processing, "isolated", isolated)
    result = asyncio.run(processing.normalize(
        b'<html>View in Telegram <a>Preview channel</a></html>',
        {"id": "channel", "kind": "telegram", "input": "channel"},
        {"adapter": "telegram_public", "settings": {}}, None))
    assert result["issues"] == ["public_preview_has_no_message_inventory"]


def test_message_markup_is_not_mislabeled_as_landing_page(monkeypatch):
    async def isolated(*args):
        return {"items": [], "issues": ["existing_issue"]}
    monkeypatch.setattr(processing, "isolated", isolated)
    result = asyncio.run(processing.normalize(
        b'<div data-post="channel/1"></div>',
        {"id": "channel", "kind": "telegram", "input": "channel"},
        {"adapter": "telegram_public", "settings": {}}, None))
    assert result["issues"] == ["existing_issue"]
