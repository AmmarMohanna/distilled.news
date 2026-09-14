"""Response-only acceptance rules. This module never receives reference data."""
import re

ARTICLE_MINIMUM, SHORT_NEWS_MINIMUM = 250, 80


def article_validation(article):
    body, title = article.get("body", ""), article.get("title", "")
    reasons = []
    if re.search(r"access denied|verify you are human|enable javascript and cookies|captcha|just a moment", (title + " " + body[:400]).lower()): reasons.append("block_or_error_page")
    # The target list may declare short news, but only the page's own title/date can apply the lower threshold.
    short_news = bool(article.get("short_news") and title.strip() and article.get("published_at"))
    minimum = SHORT_NEWS_MINIMUM if short_news else ARTICLE_MINIMUM
    if len(body.strip()) < minimum: reasons.append("insufficient_body")
    if not title.strip(): reasons.append("missing_title")
    return {"accepted": not reasons, "reasons": reasons, "body_minimum": minimum,
            "short_news_declared": bool(article.get("short_news")), "short_news_applied": short_news}
