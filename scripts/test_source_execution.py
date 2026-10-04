"""Synthetic execution tests; no provider credentials, imports or network required."""
import asyncio
import datetime
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
