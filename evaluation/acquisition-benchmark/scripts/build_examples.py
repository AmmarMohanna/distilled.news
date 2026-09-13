"""Rebuild checked-in synthetic fixtures and disabled experiment templates; no network."""
from pathlib import Path
import copy
import json

ROOT = Path(__file__).resolve().parents[1]


def write(relative, value):
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build():
    body = ("The public library reopened on Monday after workers repaired its reading rooms. "
            "Residents can borrow books and use the study desks from nine in the morning. "
            "The director said the renovation added accessible entrances and improved lighting. "
            "A free reading workshop will take place on Saturday, with registration available at the front desk. "
            "The municipal council published the new opening schedule alongside a list of activities for families.")
    article = {"title": "Public library reopens after repairs", "body": body, "published_at": "2026-09-01T09:00:00Z"}
    write("fixtures/article.json", article)
    write("fixtures/article.gold.json", article | {"anchors": ["public library reopened", "free reading workshop", "municipal council"], "must_not_contain": ["accept all cookies"]})
    write("fixtures/article.html", '<!doctype html><html lang="en"><head><title>' + article["title"] +
          '</title><meta property="article:published_time" content="2026-09-01T09:00:00Z"></head><body><nav>Home About</nav><main><article><h1>' +
          article["title"] + '</h1>' + ''.join('<p>' + sentence + '.</p>' for sentence in body.rstrip('.').split('. ')) + '</article></main></body></html>')
    write("fixtures/blocked.html", '<html><title>Access denied</title><body>Verify you are human</body></html>')
    write("fixtures/rss.xml", '''<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Test newsroom</title>
<item><guid>story-1</guid><title>Library reopened</title><description>Residents can read again.</description><link>https://example.com/library</link><pubDate>Tue, 01 Sep 2026 09:00:00 GMT</pubDate></item>
<item><guid>story-2</guid><title>افتتاح المكتبة</title><description>المكتبة مفتوحة للجميع.</description><link>https://example.com/library-ar</link><pubDate>Tue, 01 Sep 2026 10:00:00 GMT</pubDate></item>
</channel></rss>''')
    write("fixtures/rss.gold.json", {"complete_window": True, "items": [
        {"id": "story-1", "aliases": ["w4lz0a"], "text": "Library reopened. Residents can read again.", "published_at": "2026-09-01T09:00:00Z", "url": "https://example.com/library"},
        {"id": "story-2", "aliases": ["w4lz09"], "text": "افتتاح المكتبة. المكتبة مفتوحة للجميع.", "published_at": "2026-09-01T10:00:00Z", "url": "https://example.com/library-ar"}]})
    write("fixtures/telegram.html", '''<html><body><main><div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="bench_channel/101"><div class="tgme_widget_message_text js-message_text" dir="auto">A library update. افتتاح المكتبة. Bibliothèque ouverte.</div><a class="tgme_widget_message_date" href="https://t.me/bench_channel/101"><time datetime="2026-09-01T09:00:00+00:00">09:00</time></a></div></div></main></body></html>''')
    telegram = {"id": "101", "text": "A library update. افتتاح المكتبة. Bibliothèque ouverte.", "published_at": "2026-09-01T09:00:00Z", "url": "https://t.me/bench_channel/101"}
    write("fixtures/telegram.gold.json", {"complete_window": True, "items": [telegram]})
    write("fixtures/telethon.json", [{"id": 101, "message": telegram["text"], "date": telegram["published_at"]}])
    write("fixtures/x.json", {"data": [{"id": "12345", "text": "Library news from the test account", "created_at": "2026-09-01T09:00:00Z", "author_id": "555"}]})
    write("fixtures/x-apify.json", [{"id": "12345", "text": "Library news from the test account", "createdAt": "2026-09-01T09:00:00Z", "url": "https://x.com/i/web/status/12345"}])
    write("fixtures/x.gold.json", {"complete_window": True, "items": [{"id": "12345", "text": "Library news from the test account", "published_at": "2026-09-01T09:00:00Z"}]})
    linkedin = {"id": "https://www.linkedin.com/posts/test-activity-123", "url": "https://www.linkedin.com/posts/test-activity-123", "text": "A company update from the test organisation", "postedAt": "2026-09-01T09:00:00Z"}
    write("fixtures/linkedin.json", [linkedin | {"date": linkedin["postedAt"], "publishedAt": linkedin["postedAt"]}])
    write("fixtures/linkedin.gold.json", {"complete_window": True, "items": [{"id": linkedin["id"], "text": linkedin["text"], "published_at": linkedin["postedAt"]}]})
    write("fixtures/google.json", [{"title": "Library reopened", "url": "https://example.com/library", "publishedAt": "2026-09-01T09:00:00Z"}])
    write("fixtures/generic.json", [{"id": "g1", "text": "A test actor item", "url": "https://example.com/generic", "publishedAt": "2026-09-01T09:00:00Z"}])

    def route(id, adapter, **settings):
        return {"id": id, "adapter": adapter, "enabled": False, "provider": "apify" if adapter == "apify" else "brightdata" if adapter.startswith("brightdata") else adapter,
                "cost_ceiling_usd": 0, "cost_bound_confirmed": False, "settings": settings}

    x_actor = "kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest"
    routes = [route("direct", "direct_http"), route("zyte", "zyte_http"), route("unlocker", "brightdata_unlocker", zone=""),
              route("browser", "browser_playwright"), route("rss_baseline", "rss", parser="baseline"), route("rss_feedparser", "rss", parser="feedparser"),
              route("google_rss", "google_news_rss"), route("google_apify", "apify", actor_id="groupoject/google-news-scraper", schema_confirmed=False, input={}),
              route("telegram_public", "telegram_public"), route("telegram_api", "telethon"),
              route("x_profile_apify", "apify", actor_id=x_actor, schema_confirmed=False, input={"from": "{input}", "maxItems": 50, "queryType": "Latest"}),
              route("x_search_apify", "apify", actor_id=x_actor, schema_confirmed=False, input={"searchTerms": ["{input}"], "maxItems": 50, "queryType": "Latest"}),
              route("x_profile_api", "x_api"), route("x_search_api", "x_api", search="recent"),
              route("x_profile_brightdata", "brightdata_social", dataset_id="", schema_confirmed=False, query={"type": "discover_new", "discover_by": "profile_url"}, input=[{"url": "{profile_url}"}]),
              route("linkedin_company_apify", "apify", actor_id="harvestapi/linkedin-company-posts", schema_confirmed=False, input={"targetUrls": ["{input}"], "maxPosts": 50, "scrapeComments": False, "scrapeReactions": False}),
              route("linkedin_profile_apify", "apify", actor_id="harvestapi/linkedin-profile-posts", schema_confirmed=False, input={"targetUrls": ["{input}"], "maxPosts": 50, "scrapeComments": False, "scrapeReactions": False}),
              route("linkedin_company_brightdata", "brightdata_social", dataset_id="", schema_confirmed=False, query={"type": "discover_new", "discover_by": "company_url"}, input=[{"url": "{input}"}]),
              route("linkedin_profile_brightdata", "brightdata_social", dataset_id="", schema_confirmed=False, query={"type": "discover_new", "discover_by": "profile_url"}, input=[{"url": "{input}"}]),
              route("linkedin_official", "linkedin_api", linkedin_version="", authorized_read_confirmed=False),
              route("generic_apify", "apify", actor_id="", schema_confirmed=False, input={})]
    web = ["direct", "zyte", "unlocker", "browser"]
    targets = [{"id": "article_" + category, "kind": "article", "input": "https://example.com/REPLACE_" + category, "routes": web, "language": language, "category": category}
               for category, language in [("en", "en"), ("ar", "ar"), ("fr", "fr"), ("javascript", "en"), ("redirect", "en")]]
    targets += [
        {"id": "rss", "kind": "rss", "input": "https://example.com/REPLACE_feed.xml", "routes": ["rss_baseline", "rss_feedparser"]},
        {"id": "google", "kind": "google_news", "input": "REPLACE controlled news query", "routes": ["google_rss", "google_apify"], "options": {"language": "en", "region": "US"}},
        {"id": "telegram", "kind": "telegram", "input": "REPLACE_CHANNEL", "routes": ["telegram_public", "telegram_api"]},
        {"id": "x_profile", "kind": "x_profile", "input": "REPLACE_USER", "routes": ["x_profile_apify", "x_profile_api", "x_profile_brightdata"], "options": {"profile_url": "https://x.com/REPLACE_USER"}},
        {"id": "x_search", "kind": "x_search", "input": "REPLACE controlled search query", "routes": ["x_search_apify", "x_search_api"]},
        {"id": "linkedin_company", "kind": "linkedin_company", "input": "https://www.linkedin.com/company/REPLACE_COMPANY/", "routes": ["linkedin_company_apify", "linkedin_company_brightdata"]},
        {"id": "linkedin_profile", "kind": "linkedin_profile", "input": "https://www.linkedin.com/in/REPLACE_PROFILE/", "routes": ["linkedin_profile_apify", "linkedin_profile_brightdata"]},
        {"id": "linkedin_authorized", "kind": "linkedin_company", "input": "https://www.linkedin.com/company/REPLACE_AUTHORIZED/", "routes": ["linkedin_official"], "options": {"author_urn": "urn:li:organization:REPLACE_ID"}},
        {"id": "generic", "kind": "apify", "input": "https://example.com/REPLACE_actor_input", "routes": ["generic_apify"]}]
    for target in targets:
        if target["kind"] != "article": target.setdefault("options", {}).update(start_time="2026-09-01T00:00:00Z", end_time="2026-09-02T00:00:00Z")
    base = {"version": 1, "mode": "live", "data_dir": "../data/live", "repetitions": 2, "seed": 20260913,
            "budget": {"total_usd": 0, "providers": {}}, "routes": routes, "targets": targets,
            "chains": [{"id": "direct_then_managed_then_browser", "routes": web, "deadline_seconds": 90}],
            "notes": "Disabled templates: replace inputs, provide independent gold, confirm provider schemas and caps before enabling routes."}
    write("configs/stage1-pilot.json", base)
    controlled = copy.deepcopy(base)
    controlled.update(repetitions=1, stage="controlled", notes="Replace article targets with 45 independently labelled URLs (5 calibration, 40 unseen). Mark calibration:true on the five. Add reference paths and controlled source item inventories.")
    write("configs/stage2-controlled.json", controlled)
    soak = copy.deepcopy(base)
    soak.update(repetitions=1, stage="soak", schedule={"rounds": 7, "interval_seconds": 86400, "rolling_window_hours": 24}, notes="Seven daily rounds. Split separate configurations for faster source cadences. Add targets_by_round entries for newly discovered URLs; original article targets repeat unchanged.")
    write("configs/stage3-soak.json", soak)
    offline = copy.deepcopy(base)
    offline.update(mode="offline", data_dir="../data/demo", repetitions=1, extractors=["trafilatura", "readability"])
    for candidate in offline["routes"]: candidate["enabled"] = True
    offline["targets"] = [target for target in offline["targets"] if target["kind"] != "article"]
    offline["targets"].insert(0, {"id": "article_en", "kind": "article", "input": "https://example.com/library", "routes": web,
                                  "fixture": "../fixtures/article.html", "reference": "../fixtures/article.gold.json", "language": "en"})
    for target in offline["targets"][1:]:
        kind = target["kind"]
        if kind == "rss": target.update(fixture="../fixtures/rss.xml", reference="../fixtures/rss.gold.json")
        elif kind == "telegram": target.update(input="bench_channel", fixtures={"telegram_public": "../fixtures/telegram.html", "telegram_api": "../fixtures/telethon.json"}, reference="../fixtures/telegram.gold.json")
        elif kind.startswith("x_"):
            target.update(reference="../fixtures/x.gold.json", fixtures={key: "../fixtures/x-apify.json" if "apify" in key else "../fixtures/x.json" for key in target["routes"]})
        elif kind.startswith("linkedin_"): target.update(fixture="../fixtures/linkedin.json", reference="../fixtures/linkedin.gold.json")
        elif kind == "google_news": target.update(fixtures={"google_rss": "../fixtures/rss.xml", "google_apify": "../fixtures/google.json"})
        else: target.update(fixture="../fixtures/generic.json")
    write("configs/offline-demo.json", offline)


if __name__ == "__main__": build()
