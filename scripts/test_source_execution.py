"""Synthetic execution tests; no provider credentials, imports or network required."""
import asyncio
import datetime
import json
import importlib.util
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch, AsyncMock

spec = importlib.util.spec_from_file_location('source_execution', Path(__file__).with_name('source-execution.py'))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class RuntimeTests(unittest.TestCase):
    def test_google_feed_cannot_be_used_as_an_arbitrary_url_proxy(self):
        for url in ['https://127.0.0.1/rss/search', 'https://news.google.com/other', 'https://user@news.google.com/rss/search', 'http://news.google.com/rss/search']:
            with self.assertRaises(ValueError): runtime.fetch_google_feed({'url': url})
        with patch.dict(runtime.os.environ, {'SOURCE_BROWSER_EGRESS_CONFIRMED': 'false'}):
            self.assertEqual(runtime.fetch_google_feed({'url': 'https://news.google.com/rss/search?q=energy'})['error'], 'UNAVAILABLE')

    def test_google_resolution_stays_on_google_and_parses_only_the_expected_rpc(self):
        class Response:
            def __init__(self, body): self.body = body
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return self.body[:limit]
        calls = []
        def open_request(request, timeout):
            calls.append(request)
            self.assertGreater(timeout, 0)
            self.assertLessEqual(timeout, 10)
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

    def run_telegram(self, recheck=False, deleted=False, authorized=True, interrupted=False, edited=False, after_id=1, album=False):
        calls = []
        stamp = datetime.datetime(2026, 10, 4, tzinfo=datetime.timezone.utc)
        messages = [types.SimpleNamespace(id=i, message='Text', date=stamp, edit_date=None) for i in (2, 3, 4)]
        if album:
            messages = [types.SimpleNamespace(id=i,message='Album caption' if i==2 else '',date=stamp,edit_date=None) for i in (2,3,4)]
        class Client:
            def __init__(self, *args, **kwargs):
                pass
            async def connect(self):
                if interrupted: raise ConnectionError('synthetic disconnect')
            async def disconnect(self):
                pass
            async def is_user_authorized(self):
                return authorized
            async def get_input_entity(self, peer):
                return peer
            async def get_messages(self, peer, **kwargs):
                calls.append(kwargs)
                if 'ids' in kwargs:
                    return [types.SimpleNamespace(id=i,message='Corrected old post',date=stamp,edit_date=stamp) if edited else None for i in kwargs['ids']]
                if 'min_id' not in kwargs:
                    return list(reversed(messages))[:kwargs['limit']]
                return messages
        class FloodWaitError(Exception):
            seconds = 1
        telethon = types.SimpleNamespace(TelegramClient=Client, utils=types.SimpleNamespace(get_peer_id=lambda p: p))
        with tempfile.TemporaryDirectory() as directory:
            session = Path(directory) / 'private.session'
            session.touch()
            journal = runtime.sqlite3.connect(':memory:')
            journal.execute('CREATE TABLE channel_deletes(channel TEXT,message_id INTEGER,exported INTEGER DEFAULT 0)')
            journal.execute('CREATE TABLE channel_edits(channel TEXT,message_id INTEGER,exported INTEGER DEFAULT 0)')
            if deleted:
                journal.execute('INSERT INTO channel_deletes(channel,message_id) VALUES(?,?)', ('-100123',10))
                journal.commit()
            if edited:
                journal.execute('INSERT INTO channel_edits(channel,message_id) VALUES(?,?)', ('-100123',10))
                journal.commit()
            with patch.dict('sys.modules', {'telethon': telethon, 'telethon.errors': types.SimpleNamespace(FloodWaitError=FloodWaitError, AuthKeyError=type('AuthKeyError',(Exception,),{}), UnauthorizedError=type('UnauthorizedError',(Exception,),{}))}), \
                 patch.object(runtime, 'telegram_deletions', AsyncMock(return_value=(journal, 'CURRENT'))), \
                 patch.dict('os.environ', {'TELEGRAM_SESSION_PATH': str(session), 'TELEGRAM_API_ID': '1', 'TELEGRAM_API_HASH': 'synthetic'}):
                result = asyncio.run(runtime.telegram({'channelId': '-100123', 'afterId': after_id, 'limit': 2,
                                                       **({'recheckIds': [10]} if recheck else {})}))
            journal.close()
        return result, calls

    def test_telegram_requests_oldest_unseen_first_and_looks_ahead(self):
        result, calls = self.run_telegram()
        self.assertEqual(calls[0], {'min_id': 1, 'reverse': True, 'limit': 3})
        self.assertEqual([r['id'] for r in result['records']], [2, 3])
        self.assertFalse(result['exhausted'])
        self.assertTrue(result['orderedFromCheckpoint'])

    def test_telegram_cold_start_selects_recent_slice_without_backfill_continuation(self):
        result, calls = self.run_telegram(after_id=0)
        self.assertEqual(calls[0], {'limit': 12})
        self.assertTrue(result['bootstrapRecent'])
        self.assertTrue(result['exhausted'])
        self.assertEqual([r['id'] for r in result['records']], [3, 4])

    def test_telegram_bootstrap_includes_caption_before_trailing_album_media(self):
        result, calls = self.run_telegram(after_id=0, album=True)
        self.assertEqual(calls[0], {'limit': 12})
        self.assertEqual([r['id'] for r in result['records']], [2])
        self.assertEqual(result['records'][0]['text'], 'Album caption')
        self.assertTrue(result['bootstrapRecent'])

    def test_google_batch_correlates_results_and_retains_individual_failures(self):
        urls = ['https://news.google.com/rss/articles/one', 'https://news.google.com/rss/articles/two']
        def resolve(data):
            return {'url': 'https://publisher.example/post', 'requests': 2} if data['url'] == urls[0] else {'error':'UNAVAILABLE', 'requests':1}
        with tempfile.TemporaryDirectory() as directory, patch.dict(runtime.os.environ, {'SOURCE_GOOGLE_CACHE_PATH': str(Path(directory)/'cache.sqlite3')}), patch.object(runtime, 'public_url'), patch.object(runtime, 'resolve_google_article', side_effect=resolve) as resolver:
            result = runtime.resolve_google_articles({'urls': urls})
            replay = runtime.resolve_google_articles({'urls': urls})
            self.assertEqual(resolver.call_count, 3)
            self.assertTrue(replay['results'][0]['cached'])
        self.assertEqual(result['results'][0]['inputUrl'], urls[0])
        self.assertEqual(result['results'][0]['url'], 'https://publisher.example/post')
        self.assertEqual(result['results'][1]['error'], 'UNAVAILABLE')
        with self.assertRaises(ValueError):
            runtime.resolve_google_articles({'urls': ['https://127.0.0.1/private']})

    def test_google_cache_makes_progress_beyond_first_thirty_links_without_unbounded_network_work(self):
        urls = [f'https://news.google.com/rss/articles/id{i}' for i in range(40)]
        with tempfile.TemporaryDirectory() as directory, patch.dict(runtime.os.environ, {'SOURCE_GOOGLE_CACHE_PATH': str(Path(directory)/'cache.sqlite3')}), patch.object(runtime, 'public_url'), patch.object(runtime, 'resolve_google_article', return_value={'url':'https://publisher.example/post','requests':2}) as resolver:
            first = runtime.resolve_google_articles({'urls':urls})
            self.assertEqual(resolver.call_count,30)
            self.assertEqual(sum('url' in row for row in first['results']),30)
            second = runtime.resolve_google_articles({'urls':urls})
            self.assertEqual(resolver.call_count,40)
            self.assertEqual(sum('url' in row for row in second['results']),40)
            self.assertEqual(sum(row.get('cached',False) for row in second['results']),30)

    def test_missing_telegram_recheck_does_not_invent_deletion(self):
        result, calls = self.run_telegram(True)
        self.assertEqual(calls[0], {'ids': [10]})
        self.assertEqual(result['records'], [])
        self.assertFalse(result['orderedFromCheckpoint'])

    def test_explicit_telegram_deletes_are_delivered_in_rechecks_and_normal_polls(self):
        for recheck in [True, False]:
            result, _ = self.run_telegram(recheck, deleted=True)
            deleted = [r for r in result['records'] if r.get('deleted')]
            self.assertEqual(deleted, [{'id':10, 'deleted':True, 'explicitDeletion':True}])
            if not recheck:
                self.assertEqual([r['id'] for r in result['records'] if not r.get('deleted')], [2,3])

    def test_disconnected_session_is_retryable_and_next_execution_reconnects(self):
        result, _ = self.run_telegram(interrupted=True)
        self.assertEqual(result, {'error':'TRANSIENT'})
        recovered, _ = self.run_telegram()
        self.assertEqual(len(recovered['records']), 2)

    def test_explicit_edit_rechecks_an_older_post_without_replacing_the_new_message_prefix(self):
        result, _ = self.run_telegram(edited=True)
        self.assertEqual([r['id'] for r in result['records'] if not r.get('rechecked')], [2,3])
        self.assertEqual(result['records'][-1]['text'], 'Corrected old post')
        self.assertTrue(result['records'][-1]['rechecked'])

    def test_revoked_session_requires_authorization_and_does_not_collect(self):
        result, calls = self.run_telegram(authorized=False)
        self.assertEqual(result, {'error':'AUTH_REQUIRED'})
        self.assertEqual(calls, [])

    def test_google_legacy_embedded_url_is_decoded_without_network_fetch(self):
        target = b'https://publisher.example/article'
        encoded = runtime.base64.urlsafe_b64encode(b'\x08\x13\x22' + bytes([len(target)]) + target).decode().rstrip('=')
        with patch.object(runtime, 'public_url'), patch.object(runtime.urllib.request, 'build_opener') as opener:
            result = runtime.resolve_google_article({'url': 'https://news.google.com/rss/articles/' + encoded})
        self.assertEqual(result['url'], target.decode())
        self.assertEqual(result['requests'], 0)
        opener.assert_not_called()

    def test_google_dns_time_counts_towards_the_resolution_budget(self):
        clock = [0]
        def dns(_): clock[0]=9
        with patch.dict(runtime.os.environ, {'SOURCE_BROWSER_EGRESS_CONFIRMED':'true'}), patch.object(runtime.time,'monotonic',side_effect=lambda:clock[0]), patch.object(runtime,'public_url',side_effect=dns), patch.object(runtime.urllib.request,'build_opener') as opener:
            result = runtime.resolve_google_article({'url':'https://news.google.com/rss/articles/opaque','timeoutSeconds':8})
        self.assertEqual(result['error'],'UNAVAILABLE')
        self.assertEqual(result['requests'],0)
        opener.return_value.open.assert_not_called()

    def test_google_publisher_redirect_is_returned_without_following_it(self):
        error = runtime.urllib.error.HTTPError('https://news.google.com/rss/articles/id', 302, 'redirect', {'Location': 'https://publisher.example/article'}, None)
        opener = types.SimpleNamespace(open=lambda *args, **kwargs: (_ for _ in ()).throw(error))
        with patch.dict(runtime.os.environ, {'SOURCE_BROWSER_EGRESS_CONFIRMED': 'true'}), patch.object(runtime, 'public_url'), patch.object(runtime.urllib.request, 'build_opener', return_value=opener):
            result = runtime.resolve_google_article({'url': 'https://news.google.com/rss/articles/id'})
        self.assertEqual(result['url'], 'https://publisher.example/article')
        self.assertEqual(result['requests'], 1)
        error.close()

    def test_telegram_delete_journal_survives_response_loss_and_does_not_invent_gap_deletes(self):
        class Request:
            def __init__(self, *args, **kwargs): self.__dict__.update(kwargs)
        class Difference:
            def __init__(self, pts, updates=()): self.pts, self.other_updates, self.final = pts, updates, True
        class Empty(Difference): pass
        class TooLong:
            final = True
            dialog = types.SimpleNamespace(pts=30)
        class Delete:
            channel_id, messages, pts = 123, [10], 20
        class Edit:
            message = types.SimpleNamespace(id=11,peer_id=types.SimpleNamespace(channel_id=123))
            pts = 20
        modules = {
            'telethon.tl.functions.channels': types.SimpleNamespace(GetFullChannelRequest=Request),
            'telethon.tl.functions.updates': types.SimpleNamespace(GetChannelDifferenceRequest=Request),
            'telethon.tl.types': types.SimpleNamespace(ChannelMessagesFilterEmpty=Request, UpdateDeleteChannelMessages=Delete,UpdateEditChannelMessage=Edit),
            'telethon.tl.types.updates': types.SimpleNamespace(ChannelDifference=Difference, ChannelDifferenceEmpty=Empty, ChannelDifferenceTooLong=TooLong),
        }
        responses = [types.SimpleNamespace(full_chat=types.SimpleNamespace(pts=10)), Difference(20, [Delete(),Edit()]), TooLong(), Empty(30)]
        async def client(request): return responses.pop(0)
        peer = types.SimpleNamespace(channel_id=123)
        with tempfile.TemporaryDirectory() as directory, patch.dict('sys.modules', modules):
            session = Path(directory) / 'private.session'
            for expected in ['INITIALIZED', 'CURRENT', 'GAP', 'GAP']:
                journal, state = asyncio.run(runtime.telegram_deletions(client, peer, '-100123', session))
                self.assertEqual(state, expected)
                rows = journal.execute('SELECT message_id FROM channel_deletes').fetchall()
                self.assertEqual(rows, [] if expected == 'INITIALIZED' else [(10,)])
                self.assertEqual(journal.execute('SELECT message_id FROM channel_edits').fetchall(), [] if expected=='INITIALIZED' else [(11,)])
                journal.close()  # Simulate process restart or a lost delivery response.


if __name__ == '__main__':
    unittest.main()
