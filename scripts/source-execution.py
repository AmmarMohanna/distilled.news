"""Private bounded stdin/stdout source runtime. Existing authorized Telegram session only."""
import asyncio
import base64
import datetime
import ipaddress
import json
import html
import os
import re
import socket
import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
import urllib.request
import urllib.error
from pathlib import Path
from urllib.parse import urlsplit, urlencode


def iso(value):
    return value.isoformat().replace('+00:00', 'Z') if value else None


def public_url(url):
    parsed = urlsplit(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('INVALID_URL')
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == 'https' else 80), type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(answer[4][0]).is_global for answer in addresses):
        raise ValueError('NONPUBLIC_ADDRESS')
    # DNS validation is secondary; the required host egress firewall blocks DNS rebinding.


def parse_feed(data):
    import feedparser
    xml = data['xml']
    if '<!doctype' in xml.lower() or '<!entity' in xml.lower():
        raise ValueError('DTD_FORBIDDEN')
    parsed = feedparser.parse(xml)
    if parsed.bozo:
        raise ValueError('INVALID_XML')
    items = []
    for index, entry in enumerate(parsed.entries):
        identity = entry.get('id')
        link = entry.get('link')
        date = entry.get('published_parsed')
        published = iso(datetime.datetime(*date[:6], tzinfo=datetime.timezone.utc)) if date else None
        content = entry.get('content', [])
        body = content[0].get('value', '') if content else entry.get('summary', '')
        body = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ', body))).strip()
        items.append({'key': 'id:' + identity if identity else 'url:' + link if link else 'invalid-row:' + str(index),
                      'upstreamId': identity, 'url': link, 'title': entry.get('title'),
                      'body': body, 'publishedAt': published, 'identityValid': bool(identity or link),
                      'publisherId': urlsplit(entry.get('link') or data['url']).hostname})
    return {'items': items}


def extract(data):
    import trafilatura
    result = trafilatura.bare_extraction(data['html'], url=data['url'], include_comments=False,
                                        include_images=False, include_tables=True, with_metadata=True)
    if not result:
        return {'body': ''}
    if not isinstance(result, dict):
        result = result.as_dict()
    return {'body': result.get('text', ''), 'title': result.get('title'),
            'publishedAt': result.get('date'), 'language': result.get('language')}


def fetch_google_feed(data):
    """Bounded public Google feed fallback; no publisher or arbitrary URL fetch."""
    started = time.monotonic()
    parsed = urlsplit(data.get('url', ''))
    if parsed.scheme != 'https' or parsed.netloc != 'news.google.com' or parsed.path != '/rss/search' or len(parsed.query) > 2048 or parsed.fragment:
        raise ValueError('INVALID_GOOGLE_FEED')
    if os.environ.get('SOURCE_BROWSER_EGRESS_CONFIRMED') != 'true':
        return {'error': 'UNAVAILABLE'}
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args): return None
    public_url(data['url'])
    try:
        with urllib.request.build_opener(NoRedirect()).open(urllib.request.Request(data['url'], headers={'Accept': 'application/rss+xml,application/xml'}), timeout=10) as response:
            body = response.read(2000001)
            if len(body) > 2000000:
                raise ValueError('GOOGLE_FEED_TOO_LARGE')
            return {'status': response.status, 'xml': body.decode('utf-8'), 'requests': 1, 'latencyMs': int((time.monotonic() - started) * 1000)}
    except urllib.error.HTTPError as error:
        return {'status': error.code, 'requests': 1, 'latencyMs': int((time.monotonic() - started) * 1000)}


def resolve_google_article(data):
    """Best-effort public Google redirect protocol; never fetch a publisher."""
    started, requests = time.monotonic(), 0
    budget = min(30, max(1, float(data.get('timeoutSeconds', 30))))
    parsed = urlsplit(data.get('url', ''))
    match = re.fullmatch(r'/(?:rss/)?articles/([A-Za-z0-9_-]{1,2000})', parsed.path)
    if parsed.scheme != 'https' or parsed.netloc != 'news.google.com' or not match:
        raise ValueError('INVALID_GOOGLE_ARTICLE')
    # Older Google IDs embed a publisher URL in a length-delimited protobuf field.
    # Decode only that field; do not scan arbitrary bytes for a URL substring.
    try:
        encoded = match[1]
        decoded = base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4))
        if decoded.startswith(b'\x08\x13\x22'):
            size, shift, position = 0, 0, 3
            while position < len(decoded) and shift <= 21:
                value = decoded[position]
                position += 1
                size |= (value & 127) << shift
                if value < 128:
                    target = decoded[position:position + size].decode('utf-8')
                    if size <= 4096 and position + size <= len(decoded) and publisher_url(target):
                        return {'url': target, 'requests': 0, 'latencyMs': 0}
                    break
                shift += 7
    except (ValueError, UnicodeError):
        pass
    if os.environ.get('SOURCE_BROWSER_EGRESS_CONFIRMED') != 'true':
        return {'error': 'UNAVAILABLE', 'requests': 0, 'latencyMs': 0}
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            return None
    opener = urllib.request.build_opener(NoRedirect())
    def read(request):
        nonlocal requests
        remaining = budget - (time.monotonic() - started)
        if remaining <= 0:
            raise TimeoutError('GOOGLE_RESOLUTION_DEADLINE')
        public_url(request.full_url)
        remaining = budget - (time.monotonic() - started)
        if remaining <= 0:
            raise TimeoutError('GOOGLE_RESOLUTION_DEADLINE')
        requests += 1
        with opener.open(request, timeout=min(10, remaining)) as response:
            body = response.read(1000001)
            if len(body) > 1000000:
                raise ValueError('GOOGLE_RESPONSE_TOO_LARGE')
            return body.decode('utf-8')
    try:
        url = 'https://news.google.com/rss/articles/' + match[1] + '?hl=en-US&gl=US&ceid=US:en'
        try:
            page = read(urllib.request.Request(url))
        except urllib.error.HTTPError as error:
            location = error.headers.get('Location', '')
            target = urlsplit(location)
            if error.code in (301, 302, 303, 307, 308) and publisher_url(location):
                return {'url': location, 'requests': requests, 'latencyMs': int((time.monotonic() - started) * 1000)}
            if error.code not in (301, 302, 303, 307, 308) or target.netloc != 'news.google.com' or target.scheme != 'https' or not re.fullmatch(r'/(?:rss/)?articles/' + re.escape(match[1]), target.path):
                raise ValueError('GOOGLE_REDIRECT_DENIED')
            page = read(urllib.request.Request(location))
        signature = re.search(r'data-n-a-sg="([A-Za-z0-9_-]{1,300})"', page)
        timestamp = re.search(r'data-n-a-ts="(\d{1,16})"', page)
        if not signature or not timestamp:
            raise ValueError('GOOGLE_PROTOCOL_CHANGED')
        # This is a public redirect protocol. Unknown responses stay unresolved.
        context = [['X', 'X', ['X', 'X'], None, None, 1, 1, 'US:en', None, 1, None, None, None, None, None, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, None, 0, 0, None, 0]
        argument = json.dumps(['garturlreq', context, match[1], int(timestamp[1]), signature[1]], separators=(',', ':'))
        payload = json.dumps([[['Fbv4je', argument, None, 'generic']]], separators=(',', ':'))
        response = read(urllib.request.Request('https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je',
            data=urlencode({'f.req': payload}).encode(), headers={'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'}, method='POST'))
        for line in response.splitlines():
            try:
                rows = json.loads(line)
            except ValueError:
                continue
            if not isinstance(rows, list):
                continue
            for row in rows:
                if not isinstance(row, list) or len(row) < 3 or row[:2] != ['wrb.fr', 'Fbv4je'] or not isinstance(row[2], str):
                    continue
                decoded = json.loads(row[2])
                if isinstance(decoded, list) and len(decoded) > 1 and decoded[0] == 'garturlres' and publisher_url(decoded[1]):
                    return {'url': decoded[1], 'requests': requests, 'latencyMs': int((time.monotonic() - started) * 1000)}
        raise ValueError('GOOGLE_PROTOCOL_CHANGED')
    except Exception:
        return {'error': 'UNAVAILABLE', 'requests': requests, 'latencyMs': int((time.monotonic() - started) * 1000)}


def resolve_google_articles(data):
    """One bounded private call resolves a snapshot; failures retain listing URLs."""
    urls = data.get('urls')
    if not isinstance(urls, list) or not 1 <= len(urls) <= 500 or any(not isinstance(url, str) for url in urls) or len(set(urls)) != len(urls):
        raise ValueError('INVALID_GOOGLE_BATCH')
    for url in urls:
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or parsed.netloc != 'news.google.com' or not re.fullmatch(r'/(?:rss/)?articles/[A-Za-z0-9_-]{1,2000}', parsed.path):
            raise ValueError('INVALID_GOOGLE_ARTICLE')
    started = time.monotonic()
    deadline = started + 35
    results = {}
    cache = None
    try:
        cache_path = Path(os.environ.get('SOURCE_GOOGLE_CACHE_PATH', str(Path(__file__).with_name('.google-resolve-cache.sqlite3'))))
        cache = sqlite3.connect(cache_path, timeout=2)
        os.chmod(cache_path, 0o600)
        cache.execute('CREATE TABLE IF NOT EXISTS redirects(listing TEXT PRIMARY KEY,publisher TEXT NOT NULL,expires REAL NOT NULL)')
        cache.execute('DELETE FROM redirects WHERE expires<?', (time.time(),))
        for url in urls:
            saved = cache.execute('SELECT publisher FROM redirects WHERE listing=?', (url,)).fetchone()
            if saved and publisher_url(saved[0]):
                results[url] = {'url': saved[0], 'requests': 0, 'cached': True}
        cache.commit()
    except (OSError, sqlite3.Error):
        if cache:
            cache.close()
        cache = None
    pool = ThreadPoolExecutor(max_workers=6)
    pending = {}
    unresolved = [url for url in urls if url not in results]
    # Reading cached URLs spans later snapshot pages. Network work still starts
    # at most thirty fresh decodes under the same concurrency and time budget.
    remaining = iter(unresolved[:30])
    try:
        for _ in range(min(6, len(unresolved))):
            url = next(remaining)
            pending[pool.submit(resolve_google_article, {'url': url, 'timeoutSeconds': 16})] = url
        while pending:
            done, _ = wait(pending, timeout=max(0, deadline-time.monotonic()), return_when=FIRST_COMPLETED)
            if not done:
                break
            for future in done:
                url = pending.pop(future)
                try:
                    results[url] = future.result()
                except Exception:
                    results[url] = {'error': 'UNAVAILABLE', 'requests': 0}
                if time.monotonic() < deadline:
                    url = next(remaining, None)
                    if url:
                        pending[pool.submit(resolve_google_article, {'url': url, 'timeoutSeconds': 16})] = url
        # Only six requests can remain in flight. Finish those bounded requests;
        # do not enqueue more work after the stage deadline. The parent process
        # has a separate hard timeout and kills its entire process group.
        for future, url in pending.items():
            try:
                results[url] = future.result()
            except Exception:
                results[url] = {'error': 'UNAVAILABLE', 'requests': 0}
    finally:
        pool.shutdown(wait=True, cancel_futures=True)
    if cache:
        try:
            for listing, result in results.items():
                if result.get('url') and not result.get('cached'):
                    cache.execute('INSERT OR REPLACE INTO redirects VALUES(?,?,?)', (listing, result['url'], time.time()+86400))
            cache.execute('DELETE FROM redirects WHERE listing IN (SELECT listing FROM redirects ORDER BY expires DESC LIMIT -1 OFFSET 5000)')
            cache.commit()
        except (OSError, sqlite3.Error):
            # A cache write failure must not discard successfully resolved links.
            pass
        finally:
            cache.close()
    return {'results': [{'inputUrl': url, **results.get(url, {'error': 'UNAVAILABLE', 'requests': 0})} for url in urls],
            'latencyMs': int((time.monotonic()-started)*1000)}


def publisher_url(value):
    if not isinstance(value, str) or len(value) > 4096:
        return False
    try:
        target = urlsplit(value)
        host = target.hostname or ''
        if target.scheme != 'https' or target.username or target.password or target.port or '.' not in host or host == 'news.google.com' or host.endswith(('.local', '.internal', '.localhost')):
            return False
        public_url(value)  # Validate DNS without fetching the publisher.
        return True
    except (ValueError, OSError):
        return False


async def telegram_deletions(client, peer, channel, session):
    """Durable channel PTS + explicit delete journal, independent of response delivery.

    Never infer deletes from an empty history response or a difference-too-long gap.
    A lost stdout response is safe: the delete journal is retained for later rechecks.
    """
    from telethon.tl.functions.channels import GetFullChannelRequest
    from telethon.tl.functions.updates import GetChannelDifferenceRequest
    from telethon.tl.types import ChannelMessagesFilterEmpty, UpdateDeleteChannelMessages, UpdateEditChannelMessage
    from telethon.tl.types.updates import ChannelDifference, ChannelDifferenceEmpty, ChannelDifferenceTooLong
    db_path = str(session) + '.updates.sqlite3'
    db = sqlite3.connect(db_path, timeout=2)
    try:
        os.chmod(db_path, 0o600)
        db.execute('CREATE TABLE IF NOT EXISTS channel_state(channel TEXT PRIMARY KEY, pts INTEGER NOT NULL, gap INTEGER NOT NULL DEFAULT 0)')
        db.execute('CREATE TABLE IF NOT EXISTS channel_deletes(channel TEXT, message_id INTEGER, pts INTEGER NOT NULL, exported INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(channel,message_id))')
        db.execute('CREATE TABLE IF NOT EXISTS channel_edits(channel TEXT, message_id INTEGER, pts INTEGER NOT NULL, exported INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(channel,message_id))')
        db.execute('BEGIN IMMEDIATE')
        saved = db.execute('SELECT pts,gap FROM channel_state WHERE channel=?', (channel,)).fetchone()
        if not saved:
            full = await client(GetFullChannelRequest(peer))
            db.execute('INSERT INTO channel_state(channel,pts) VALUES(?,?)', (channel, full.full_chat.pts))
            db.commit()
            return db, 'INITIALIZED'
        pts, gap = saved
        state = 'GAP' if gap else 'CURRENT'
        for _ in range(2):
            difference = await client(GetChannelDifferenceRequest(channel=peer, filter=ChannelMessagesFilterEmpty(), pts=pts, limit=100, force=True))
            if isinstance(difference, ChannelDifferenceTooLong):
                pts = difference.dialog.pts
                gap, state = 1, 'GAP'
            elif isinstance(difference, (ChannelDifference, ChannelDifferenceEmpty)):
                if difference.pts < pts:
                    raise ValueError('INVALID_CHANNEL_PTS')
                for update in getattr(difference, 'other_updates', []):
                    if isinstance(update, UpdateDeleteChannelMessages) and update.channel_id == peer.channel_id:
                        for message_id in update.messages:
                            db.execute('INSERT INTO channel_deletes(channel,message_id,pts) VALUES(?,?,?) ON CONFLICT(channel,message_id) DO UPDATE SET pts=MAX(pts,excluded.pts)', (channel, message_id, update.pts))
                    elif isinstance(update, UpdateEditChannelMessage) and getattr(update.message.peer_id, 'channel_id', None) == peer.channel_id:
                        db.execute('INSERT INTO channel_edits(channel,message_id,pts) VALUES(?,?,?) ON CONFLICT(channel,message_id) DO UPDATE SET pts=MAX(pts,excluded.pts),exported=0', (channel, update.message.id, update.pts))
                pts = difference.pts
            else:
                raise ValueError('INVALID_CHANNEL_DIFFERENCE')
            db.execute('UPDATE channel_state SET pts=?,gap=? WHERE channel=?', (pts, gap, channel))
            if getattr(difference, 'final', False):
                break
            state = 'GAP' if gap else 'PENDING'
        db.commit()
        return db, state
    except BaseException:
        db.rollback()
        db.close()
        raise


async def telegram(data):
    from telethon import TelegramClient, utils
    from telethon.errors import FloodWaitError, AuthKeyError, UnauthorizedError
    session = Path(os.environ.get('TELEGRAM_SESSION_PATH', ''))
    if not os.environ.get('TELEGRAM_SESSION_PATH') or not session.is_file():
        return {'error': 'AUTH_REQUIRED'}
    client = TelegramClient(str(session), int(os.environ['TELEGRAM_API_ID']), os.environ['TELEGRAM_API_HASH'],
                            connection_retries=1, request_retries=1, flood_sleep_threshold=0,
                            timeout=15, auto_reconnect=False, receive_updates=False)
    journal = None
    try:
        await client.connect()
        if not await client.is_user_authorized():
            return {'error': 'AUTH_REQUIRED'}
        peer_id = int(data['channelId'])
        # ID must already be in this authorized account's entity cache. Never join a channel.
        peer = await client.get_input_entity(peer_id)
        if str(utils.get_peer_id(peer)) != data['channelId']:
            raise ValueError('PEER_MISMATCH')
        journal, deletion_state = await telegram_deletions(client, peer, data['channelId'], session)
        limit = data['limit']
        if not isinstance(limit, int) or not 1 <= limit <= 500:
            raise ValueError('INVALID_LIMIT')
        ids = data.get('recheckIds')
        if ids is not None:
            if len(ids) > limit or any(not isinstance(i, int) or i <= 0 for i in ids):
                raise ValueError('INVALID_RECHECK')
            messages = await client.get_messages(peer, ids=ids)
            ordered, exhausted = False, False
        elif data['afterId'] == 0 and data.get('startTime') is None:
            # Cold starts deliberately select recent posts, not the channel's
            # first-ever messages. This is a partial historical window.
            messages = await client.get_messages(peer, limit=limit)
            messages = sorted((m for m in messages if m is not None), key=lambda m: m.id)
            ordered, exhausted = True, True
        else:
            # Read oldest unseen first; a latest-N slice would skip a busy channel's backlog.
            messages = await client.get_messages(peer, min_id=data['afterId'], reverse=True, limit=limit + 1)
            exhausted = len(messages) <= limit
            messages, ordered = messages[:limit], True
        records = [{'id': m.id, 'text': m.message or '', 'publishedAt': iso(m.date),
                    'editedAt': iso(m.edit_date)} for m in messages if m is not None]
        if ids:
            present = {record['id'] for record in records}
            for message_id in ids:
                if message_id not in present and journal.execute('SELECT 1 FROM channel_deletes WHERE channel=? AND message_id=?', (data['channelId'], message_id)).fetchone():
                    records.append({'id': message_id, 'deleted': True, 'explicitDeletion': True})
        else:
            # Replay retained explicit deletes in bounded rotating batches. They
            # have no relation to the new-message cursor and are never discarded
            # on export: response loss or another feed cannot consume the event.
            changed_ids = [row[0] for row in journal.execute('SELECT message_id,MIN(exported) AS last_export FROM (SELECT message_id,exported FROM channel_deletes WHERE channel=? UNION ALL SELECT message_id,exported FROM channel_edits WHERE channel=?) GROUP BY message_id ORDER BY last_export,message_id LIMIT ?', (data['channelId'], data['channelId'], limit))]
            if changed_ids:
                new_ids = {record['id'] for record in records}
                current = await client.get_messages(peer, ids=changed_ids)
                for message_id, message in zip(changed_ids, current):
                    if message is None:
                        if journal.execute('SELECT 1 FROM channel_deletes WHERE channel=? AND message_id=?', (data['channelId'],message_id)).fetchone():
                            records = [record for record in records if record['id'] != message_id]
                            records.append({'id': message_id, 'deleted': True, 'explicitDeletion': True})
                    else:
                        latest = {'id':message.id,'text':message.message or '', 'publishedAt':iso(message.date),'editedAt':iso(message.edit_date),'rechecked':message_id not in new_ids}
                        existing_index = next((index for index, record in enumerate(records) if record['id']==message_id), None)
                        if existing_index is None:
                            records.append(latest)
                        else:
                            records[existing_index] = latest
                        # A current returned message is stronger than an older cached delete.
                    exported = time.time_ns()
                    journal.execute('UPDATE channel_deletes SET exported=? WHERE channel=? AND message_id=?', (exported, data['channelId'], message_id))
                    journal.execute('UPDATE channel_edits SET exported=? WHERE channel=? AND message_id=?', (exported, data['channelId'], message_id))
                journal.commit()
        return {'channelId': data['channelId'], 'records': records, 'orderedFromCheckpoint': ordered,
                'bootstrapRecent': ids is None and data['afterId'] == 0 and data.get('startTime') is None,
                'exhausted': exhausted, 'deletionState': deletion_state}
    except FloodWaitError as error:
        return {'error': 'RATE_LIMIT', 'retryNotBefore': iso(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=error.seconds))}
    except (AuthKeyError, UnauthorizedError):
        return {'error': 'AUTH_REQUIRED'}
    except (ConnectionError, OSError, asyncio.TimeoutError):
        # Each subsequent bounded execution reconnects the same authorized session.
        # Never delete the session or start an interactive login from collection.
        return {'error': 'TRANSIENT'}
    finally:
        if journal is not None:
            journal.close()
        await client.disconnect()


async def resolve_telegram(data):
    from telethon import TelegramClient, utils
    from telethon.tl.types import Channel
    from telethon.errors import FloodWaitError

    username = data.get('username')
    if not isinstance(username, str) or not re.fullmatch(r'[A-Za-z0-9_]{5,32}', username):
        raise ValueError('INVALID_CHANNEL_USERNAME')
    session_value = os.environ.get('TELEGRAM_SESSION_PATH')
    if not session_value or not Path(session_value).is_file():
        return {'error': 'AUTH_REQUIRED'}
    client = TelegramClient(session_value, int(os.environ['TELEGRAM_API_ID']),
                            os.environ['TELEGRAM_API_HASH'], connection_retries=1,
                            request_retries=1, flood_sleep_threshold=0, timeout=15,
                            auto_reconnect=False)
    try:
        await client.connect()
        if not await client.is_user_authorized():
            return {'error': 'AUTH_REQUIRED'}
        # Resolve a public username without joining or subscribing to the channel.
        entity = await client.get_entity(username)
        if not isinstance(entity, Channel) or not entity.username or entity.username.lower() != username.lower():
            return {'error': 'UNAVAILABLE'}
        return {'channelId': str(utils.get_peer_id(entity)), 'username': entity.username}
    except FloodWaitError as error:
        return {'error': 'RATE_LIMIT', 'retryNotBefore': iso(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=error.seconds))}
    except (ValueError, TypeError):
        return {'error': 'UNAVAILABLE'}
    finally:
        await client.disconnect()


async def browser(data):
    from playwright.async_api import async_playwright
    if os.environ.get('SOURCE_BROWSER_EGRESS_CONFIRMED') != 'true':
        return {'error': 'UNAVAILABLE'}
    public_url(data['url'])
    async with async_playwright() as engine:
        browser = await engine.chromium.launch(headless=True)  # Do not add --no-sandbox.
        context = await browser.new_context(service_workers='block', accept_downloads=False)
        requests = 0
        async def route(request):
            nonlocal requests
            if request.request.resource_type in ('image', 'media', 'font'):
                return await request.abort()
            try:
                await asyncio.to_thread(public_url, request.request.url)
            except Exception:
                return await request.abort()
            requests += 1
            return await request.continue_()
        await context.route('**/*', route)
        try:
            page = await context.new_page()
            response = await page.goto(data['url'], wait_until='domcontentloaded', timeout=20000)
            html = await page.content()
            if len(html.encode()) > 4000000:
                raise ValueError('HTML_TOO_LARGE')
            return {'status': response.status if response else 0, 'html': html, 'requests': requests}
        finally:
            await context.close()
            await browser.close()


async def main():
    data = sys.stdin.buffer.read(8000001)
    if len(data) > 8000000:
        raise ValueError('INPUT_TOO_LARGE')
    request = json.loads(data)
    kind, inputs = request['kind'], request['input']
    if kind == 'feedparser':
        result = parse_feed(inputs)
    elif kind == 'extract':
        result = extract(inputs)
    elif kind == 'telethon':
        result = await telegram(inputs)
    elif kind == 'telegram_resolve':
        result = await resolve_telegram(inputs)
    elif kind == 'google_resolve':
        result = await asyncio.to_thread(resolve_google_articles if 'urls' in inputs else resolve_google_article, inputs)
    elif kind == 'google_feed':
        result = await asyncio.to_thread(fetch_google_feed, inputs)
    elif kind == 'playwright':
        result = await browser(inputs)
    else:
        raise ValueError('INVALID_KIND')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except Exception:
        # No credential-bearing exception strings in stdout/stderr.
        print(json.dumps({'error': 'EXECUTION_FAILED'}))
