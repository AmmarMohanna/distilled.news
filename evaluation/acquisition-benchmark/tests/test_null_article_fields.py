import pytest

from bench.score import normalize_text, score_article
from bench.validator import article_validation


@pytest.mark.parametrize("title", [None, ""])
def test_error_page_produces_failure_instead_of_scoring_exception(title):
    article = {"title": title, "body": "Unknown Error", "published_at": None}
    reference = {"title": "Actual article", "body": "A real article body", "anchors": ["real article"]}
    score = score_article(article, reference)
    assert score["label"] == "FAIL"
    assert score["validation"]["reasons"] == ["insufficient_body", "missing_title"]
    assert score["title_f1"] == 0
    assert score_article(article, None)["label"] == "AUTO_FAIL"


def test_null_body_does_not_trigger_short_news_exception_or_crash():
    result = article_validation({"title": None, "body": None, "short_news": True, "published_at": "2026-09-23"})
    assert result["accepted"] is False
    assert result["short_news_applied"] is False
    assert result["reasons"] == ["insufficient_body", "missing_title"]


def test_none_is_not_scored_as_the_word_none():
    assert normalize_text(None) == ""
    score = score_article({"title": None, "body": "x" * 300}, {"title": "None", "body": "x" * 300})
    assert score["title_f1"] == 0
    assert score["label"] == "FAIL"


def test_client_challenge_is_rejected_even_with_long_body():
    article = {"title": "Client Challenge", "body": "A required part of this site could not load. " + "Please check your connection. " * 12}
    assert score_article(article, None)["label"] == "AUTO_FAIL"
    assert "block_or_error_page" in article_validation(article)["reasons"]


def test_article_discussing_browser_challenge_is_not_rejected():
    article = {"title": "How browser challenges affect publishers", "body": "A required part of this site could not load. " * 12}
    assert article_validation(article)["accepted"]
