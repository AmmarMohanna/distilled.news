"""Offline identity/cache regressions; no Telegram connection or session reads."""
import asyncio
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('source_execution', Path(__file__).with_name('source-execution.py'))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class Channel:
    def __init__(self, username='telegram'):
        self.username = username


class FloodWaitError(Exception):
    seconds = 3600


class TelegramResolutionTest(unittest.TestCase):
    def run_resolution(self, *, channel='telegram', authorized=True, flood=False):
        calls = []
        peer = object()

        class Client:
            async def connect(self):
                calls.append('connect')

            async def disconnect(self):
                calls.append('disconnect')

            async def is_user_authorized(self):
                return authorized

            async def get_input_entity(self, username):
                self_username = username
                calls.append(('cached_input', self_username))
                if flood:
                    raise FloodWaitError()
                return peer

            async def get_entity(self, value):
                if value is not peer:
                    raise AssertionError('Forced a username lookup instead of using the cached peer')
                calls.append('refresh_channel')
                return Channel(channel)

        telethon = types.ModuleType('telethon')
        telethon.TelegramClient = lambda *args, **kwargs: Client()
        telethon.utils = types.SimpleNamespace(get_peer_id=lambda entity: -100123456)
        errors = types.ModuleType('telethon.errors')
        errors.FloodWaitError = FloodWaitError
        tl_types = types.ModuleType('telethon.tl.types')
        tl_types.Channel = Channel
        modules = {'telethon': telethon, 'telethon.errors': errors, 'telethon.tl': types.ModuleType('telethon.tl'), 'telethon.tl.types': tl_types}
        with patch.dict(sys.modules, modules), patch.dict(runtime.os.environ, {'TELEGRAM_SESSION_PATH': '/unused/session', 'TELEGRAM_API_ID': '1', 'TELEGRAM_API_HASH': 'offline'}), patch.object(runtime.Path, 'is_file', return_value=True):
            result = asyncio.run(runtime.resolve_telegram({'username': 'telegram'}))
        return result, calls

    def test_cached_peer_is_refreshed_and_identity_is_verified(self):
        result, calls = self.run_resolution()
        self.assertEqual(result, {'channelId': '-100123456', 'username': 'telegram'})
        self.assertIn(('cached_input', 'telegram'), calls)
        self.assertIn('refresh_channel', calls)
        self.assertEqual(calls[-1], 'disconnect')

    def test_changed_username_is_not_accepted_from_cache(self):
        result, _ = self.run_resolution(channel='different_channel')
        self.assertEqual(result, {'error': 'UNAVAILABLE'})

    def test_flood_wait_retains_provider_deadline(self):
        result, calls = self.run_resolution(flood=True)
        self.assertEqual(result['error'], 'RATE_LIMIT')
        self.assertIn('retryNotBefore', result)
        self.assertNotIn('refresh_channel', calls)
        self.assertEqual(calls[-1], 'disconnect')

    def test_missing_authorization_cannot_use_cached_identity(self):
        result, calls = self.run_resolution(authorized=False)
        self.assertEqual(result, {'error': 'AUTH_REQUIRED'})
        self.assertNotIn(('cached_input', 'telegram'), calls)


if __name__ == '__main__':
    unittest.main()
