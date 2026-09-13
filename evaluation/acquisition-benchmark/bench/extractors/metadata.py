"""Explicit article metadata from saved HTML; never fetch or invent timestamps."""
from datetime import datetime
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit


class ArticleMetadata(HTMLParser):
    def __init__(self, url):
        super().__init__(convert_charrefs=True)
        self.url = url
        self.fields, self.provenance = {}, {}
        self.in_title, self.title = False, []

    def record(self, field, value, source):
        if not value or field in self.fields:
            return
        value = value.strip()
        if not value:
            return
        raw = value
        if field in {"published_at", "updated_at"}:
            try: datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError: return
        if field == "canonical_url":
            try:
                value = urljoin(self.url, value)
                parsed = urlsplit(value)
                if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
                    return
            except ValueError: return
        self.fields[field] = value
        self.provenance[field] = {"source": source, "raw": raw}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "html": self.record("language", attrs.get("lang"), "html[lang]")
        if tag == "title": self.in_title = True
        if tag == "link" and "canonical" in (attrs.get("rel") or "").lower().split():
            self.record("canonical_url", attrs.get("href"), "link[rel=canonical]")
        if tag == "meta":
            name = (attrs.get("property") or attrs.get("name") or attrs.get("itemprop") or "").lower()
            field = {"og:title": "title", "og:site_name": "publisher", "article:published_time": "published_at",
                     "datepublished": "published_at", "pubdate": "published_at",
                     "article:modified_time": "updated_at", "datemodified": "updated_at"}.get(name)
            if field: self.record(field, attrs.get("content"), f"meta[{name}]")
        if tag == "time":
            field = {"datepublished": "published_at", "datemodified": "updated_at"}.get((attrs.get("itemprop") or "").lower())
            if field: self.record(field, attrs.get("datetime"), f"time[{attrs['itemprop']}]")

    def handle_endtag(self, tag):
        if tag == "title": self.in_title = False

    def handle_data(self, data):
        if self.in_title: self.title.append(data)


def extract_metadata(html, url):
    parser = ArticleMetadata(url)
    parser.feed(html)
    parser.close()
    parser.record("title", "".join(parser.title), "title")
    return parser.fields, parser.provenance
