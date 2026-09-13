"""Response-only acceptance rules. This module never receives reference data."""
import re


def article_validation(article):
    body, title = article.get("body", ""), article.get("title", "")
    reasons = []
    if re.search(r"access denied|verify you are human|enable javascript and cookies|captcha|just a moment", (title + " " + body[:400]).lower()): reasons.append("block_or_error_page")
    if len(body.strip()) < (80 if title and article.get("short_news") else 250): reasons.append("insufficient_body")
    if not title.strip(): reasons.append("missing_title")
    return {"accepted": not reasons, "reasons": reasons}
