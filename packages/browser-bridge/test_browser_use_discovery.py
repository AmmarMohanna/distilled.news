import unittest

from browser_use_discovery import article_candidate_score


class ObservedArticleRankingTest(unittest.TestCase):
    def test_dated_article_beats_navigation_and_assets(self):
        dated = "https://publisher.example/politics/2026/9/26/a-public-story"
        plain = "https://publisher.example/article/a"
        self.assertGreater(article_candidate_score(dated), article_candidate_score(plain))
        self.assertGreater(article_candidate_score(plain), article_candidate_score("https://publisher.example/search/query"))
        self.assertLess(article_candidate_score("https://publisher.example/static/app.js"), 20)


if __name__ == "__main__":
    unittest.main()
