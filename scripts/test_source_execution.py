"""Synthetic execution tests; no provider credentials, imports or network required."""
import asyncio
import datetime
import json
import importlib.util
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('source_execution', Path(__file__).with_name('source-execution.py'))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class RuntimeTests(unittest.TestCase):
    def test_google_resolution_stays_on_google_and_parses_only_the_expected_rpc(self):
        class Response:
            def __init__(self, body): self.body = body
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return self.body[:limit]
        calls = []
        def open_request(request, timeout):
            calls.append(request)
            self.assertEqual(timeout, 10)
            if request.get_method() == 'POST':
                return Response((")]}'\n\n" + json.dumps([['wrb.fr', 'Fbv4je', json.dumps(['garturlres', 'https://publisher.example/article'])]])).encode())
            return Response(b'<div data-n-a-sg="signed_public_value" data-n-a-ts="1234"></div>')
        opener = types.SimpleNamespace(open=open_request)
        with patch.dict(runtime.os.environ, {'SOURCE_BROWSER_EGRESS_CONFIRMED': 'true'}), patch.object(runtime, 'public_url'), patch.object(runtime.urllib.request, 'build_opener', return_value=opener):
            result = runtime.resolve_google_article({'url': 'https://news.google.com/rss/articles/CBMiabc'})
        self.assertEqual(result['url'], 'https://publisher.example/article')
        self.assertEqual(result['requests'], 2)
        self.assertEqual([runtime.urlsplit(r.full_url).hostname for r in calls], ['news.google.com'] * 2)

    def test_google_resolution_rejects_private_or_changed_protocol_without_fetching_a_publisher(self):
        with self.assertRaises(ValueError):
            runtime.resolve_google_article({'url': 'https://127.0.0.1/articles/CBMiabc'})
        with patch.dict(runtime.os.environ, {'SOURCE_BROWSER_EGRESS_CONFIRMED': 'true'}), patch.object(runtime, 'public_url', side_effect=ValueError('NONPUBLIC_ADDRESS')), patch.object(runtime.urllib.request, 'build_opener') as opener:
            result = runtime.resolve_google_article({'url': 'https://news.google.com/rss/articles/CBMiabc'})
            self.assertEqual(result['error'], 'UNAVAILABLE')
            self.assertEqual(result['requests'], 0)
            opener.return_value.open.assert_not_called()

    def test_feedparser_identity_without_guid_matches_native_url_key(self):
        entry = {'link': 'https://publisher.example/post', 'summary': '<p>Hello &amp; world</p>'}
        fake = types.SimpleNamespace(parse=lambda xml: types.SimpleNamespace(bozo=False, entries=[entry]))
        with patch.dict('sys.modules', {'feedparser': fake}):
            result = runtime.parse_feed({'xml': '<rss/>', 'url': 'https://publisher.example/rss'})
        self.assertEqual(result['items'][0]['key'], 'url:https://publisher.example/post')
        self.assertEqual(result['items'][0]['body'], 'Hello & world')
        self.assertIsNone(result['items'][0]['publishedAt'])

    def test_feedparser_rejects_dtd(self):
        with patch.dict('sys.modules', {'feedparser': types.SimpleNamespace()}):
            with self.assertRaises(ValueError):
                runtime.parse_feed({'xml': '<!DOCTYPE rss><rss/>', 'url': 'https://example.com'})

    def run_telegram(self, recheck=False):
        calls = []
        stamp = datetime.datetime(2026, 10, 4, tzinfo=datetime.timezone.utc)
        messages = [types.SimpleNamespace(id=i, message='Text', date=stamp, edit_date=None) for i in (2, 3, 4)]
        class Client:
            def __init__(self, *args, **kwargs):
                pass
            async def connect(self):
                pass
            async def disconnect(self):
                pass
            async def is_user_authorized(self):
                return True
            async def get_input_entity(self, peer):
                return peer
            async def get_messages(self, peer, **kwargs):
                calls.append(kwargs)
                return [None] if 'ids' in kwargs else messages
        class FloodWaitError(Exception):
            seconds = 1
        telethon = types.SimpleNamespace(TelegramClient=Client, utils=types.SimpleNamespace(get_peer_id=lambda p: p))
        with tempfile.TemporaryDirectory() as directory:
            session = Path(directory) / 'private.session'
            session.touch()
            with patch.dict('sys.modules', {'telethon': telethon, 'telethon.errors': types.SimpleNamespace(FloodWaitError=FloodWaitError)}), \
                 patch.dict('os.environ', {'TELEGRAM_SESSION_PATH': str(session), 'TELEGRAM_API_ID': '1', 'TELEGRAM_API_HASH': 'synthetic'}):
                result = asyncio.run(runtime.telegram({'channelId': '-100123', 'afterId': 1, 'limit': 2,
                                                       **({'recheckIds': [10]} if recheck else {})}))
        return result, calls

    def test_telegram_requests_oldest_unseen_first_and_looks_ahead(self):
        result, calls = self.run_telegram()
        self.assertEqual(calls[0], {'min_id': 1, 'reverse': True, 'limit': 3})
        self.assertEqual([r['id'] for r in result['records']], [2, 3])
        self.assertFalse(result['exhausted'])
        self.assertTrue(result['orderedFromCheckpoint'])

    def test_missing_telegram_recheck_does_not_invent_deletion(self):
        result, calls = self.run_telegram(True)
        self.assertEqual(calls[0], {'ids': [10]})
        self.assertEqual(result['records'], [])
        self.assertFalse(result['orderedFromCheckpoint'])


if __name__ == '__main__':
    unittest.main()
