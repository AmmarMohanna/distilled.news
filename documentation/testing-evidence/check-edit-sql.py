"""Offline SQLite checks of the actual repository edit statements; no cloud access."""
import re
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[2]
source = (root / 'apps/worker/src/repository.ts').read_text(encoding='utf-8')
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE raw_messages (id TEXT PRIMARY KEY, text TEXT, links_json TEXT, media_json TEXT, received_at TEXT, raw_payload_key TEXT, processed_at TEXT, posted_at TEXT, source_url TEXT, expires_at TEXT)')
db.execute("INSERT INTO raw_messages VALUES ('post', 'old', '[]', '[]', 'first', 'old-archive', 'processed', 'original-date', 'original-url', 'original-expiry')")
update = re.search(r'`(UPDATE raw_messages SET text = .*?)`', source, re.S).group(1)
db.execute(update, ('corrected', '["link"]', '[]', 'later', 'new-archive', 'post'))
assert db.execute('SELECT * FROM raw_messages').fetchone() == ('post', 'corrected', '["link"]', '[]', 'later', 'new-archive', None, 'original-date', 'original-url', 'original-expiry')

db.execute('CREATE TABLE briefing_item_evidence (id TEXT PRIMARY KEY, briefing_item_id TEXT, raw_message_id TEXT, source_id TEXT, source_title TEXT, source_type TEXT, source_provider TEXT, source_kind TEXT, source_url TEXT, posted_at TEXT, text TEXT, links_json TEXT, media_json TEXT)')
upsert = re.search(r'`(INSERT INTO briefing_item_evidence .*?)`', source, re.S).group(1)
values = ['evidence', 'item', 'post', 'source', 'title', 'channel', 'apify', 'x_profile', 'original-url', 'original-date', 'old', '[]', '[]']
db.execute(upsert, values)
values[10:13] = ['corrected', '["link"]', '[]']
db.execute(upsert, values)
assert db.execute('SELECT count(*) FROM briefing_item_evidence').fetchone()[0] == 1
assert db.execute('SELECT text, links_json, source_url, posted_at FROM briefing_item_evidence').fetchone() == ('corrected', '["link"]', 'original-url', 'original-date')
print('PASS: raw correction resets processing and preserves date/link/expiry; evidence upsert replaces text without duplication.')
