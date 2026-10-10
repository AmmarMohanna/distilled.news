"""Private bounded stdin/stdout source runtime. Existing authorized Telegram session only."""
import asyncio
import datetime
import ipaddress
import json
import html
import os
import re
import socket
import sys
import time
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
    parsed = urlsplit(data.get('url', ''))
    match = re.fullmatch(r'/(?:rss/)?articles/([A-Za-z0-9_-]{1,2000})', parsed.path)
    if parsed.scheme != 'https' or parsed.netloc != 'news.google.com' or not match:
        raise ValueError('INVALID_GOOGLE_ARTICLE')
    if os.environ.get('SOURCE_BROWSER_EGRESS_CONFIRMED') != 'true':
        return {'error': 'UNAVAILABLE', 'requests': 0, 'latencyMs': 0}
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            return None
    opener = urllib.request.build_opener(NoRedirect())
    def read(request):
        nonlocal requests
        public_url(request.full_url)
        requests += 1
        with opener.open(request, timeout=10) as response:
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
                if isinstance(decoded, list) and len(decoded) > 1 and decoded[0] == 'garturlres' and isinstance(decoded[1], str):
                    return {'url': decoded[1], 'requests': requests, 'latencyMs': int((time.monotonic() - started) * 1000)}
        raise ValueError('GOOGLE_PROTOCOL_CHANGED')
    except Exception:
        return {'error': 'UNAVAILABLE', 'requests': requests, 'latencyMs': int((time.monotonic() - started) * 1000)}


async def telegram(data):
    from telethon import TelegramClient, utils
    from telethon.errors import FloodWaitError
    session = Path(os.environ.get('TELEGRAM_SESSION_PATH', ''))
    if not os.environ.get('TELEGRAM_SESSION_PATH') or not session.is_file():
        return {'error': 'AUTH_REQUIRED'}
    client = TelegramClient(str(session), int(os.environ['TELEGRAM_API_ID']), os.environ['TELEGRAM_API_HASH'],
                            connection_retries=1, request_retries=1, flood_sleep_threshold=0,
                            timeout=15, auto_reconnect=False)
    try:
        await client.connect()
        if not await client.is_user_authorized():
            return {'error': 'AUTH_REQUIRED'}
        peer_id = int(data['channelId'])
        # ID must already be in this authorized account's entity cache. Never join a channel.
        peer = await client.get_input_entity(peer_id)
        if str(utils.get_peer_id(peer)) != data['channelId']:
            raise ValueError('PEER_MISMATCH')
        limit = data['limit']
        if not isinstance(limit, int) or not 1 <= limit <= 500:
            raise ValueError('INVALID_LIMIT')
        ids = data.get('recheckIds')
        if ids is not None:
            if len(ids) > limit or any(not isinstance(i, int) or i <= 0 for i in ids):
                raise ValueError('INVALID_RECHECK')
            messages = await client.get_messages(peer, ids=ids)
            ordered, exhausted = False, False
        else:
            # Read oldest unseen first; a latest-N slice would skip a busy channel's backlog.
            messages = await client.get_messages(peer, min_id=data['afterId'], reverse=True, limit=limit + 1)
            exhausted = len(messages) <= limit
            messages, ordered = messages[:limit], True
        records = [{'id': m.id, 'text': m.message or '', 'publishedAt': iso(m.date),
                    'editedAt': iso(m.edit_date)} for m in messages if m is not None]
        # Missing get_messages(ids=...) entries are deliberately not deletion observations.
        return {'channelId': data['channelId'], 'records': records, 'orderedFromCheckpoint': ordered,
                'exhausted': exhausted}
    except FloodWaitError as error:
        return {'error': 'RATE_LIMIT', 'retryNotBefore': iso(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=error.seconds))}
    finally:
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
        result = await asyncio.to_thread(resolve_google_article, inputs)
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
