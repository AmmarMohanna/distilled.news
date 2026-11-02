import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
import suite


def case(track, feed, aid, text='body', url=None, lang='en'):
    return {'_file':track, 'feedId':feed, 'language':lang, 'provenance':{'trackId':track},
            'articles':[{'id':aid, 'url':url, 'text':text}]}


class EvaluationTests(unittest.TestCase):
    def test_shared_identity_never_crosses_split(self):
        cases = [case('a','f1','1','one'), case('b','f2','1','two'),
                 case('c','f3','3','two'), case('d','f4','4','four','https://a'),
                 case('e','f5','5','five','https://a'), case('f','f1','6','six')]
        assignment, _ = suite.split_cases(cases)
        self.assertEqual(assignment['a'], assignment['b'])
        self.assertEqual(assignment['b'], assignment['c'])
        self.assertEqual(assignment['a'], assignment['f'])
        self.assertEqual(assignment['d'], assignment['e'])
        self.assertEqual(suite.split_cases(cases), suite.split_cases(list(reversed(cases))))

    def test_three_independent_groups_cover_splits(self):
        assignment, _ = suite.split_cases([case(str(i),str(i),str(i),str(i)) for i in range(3)])
        self.assertEqual({r['split'] for r in assignment.values()}, {'development','validation','held-out'})

    def test_percentile(self):
        self.assertIsNone(suite.percentile([], .95))
        self.assertEqual(suite.percentile([1,3], .5), 2)
        self.assertAlmostEqual(suite.percentile([1,3], .95), 2.9)

    def test_score_rejects_unreviewed_examples(self):
        with self.assertRaises(ValueError):
            suite.score(Path(__file__).parent / 'templates/adjudicated.example.json')

    def test_score_rejects_invalid_counts(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'reviews.json'
            (Path(tmp) / 'evidence.json').write_text('{}')
            row = dict(split='development',language='en',status='adjudicated',reviewers=['R1','R2'],evidenceFile='evidence.json',
                       claims=1,supportedClaims=2)
            path.write_text(json.dumps([row]))
            with self.assertRaises(ValueError):
                suite.score(path)

    def test_scoring_keeps_splits_separate_and_empty_denominators_null(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'reviews.json'
            (Path(tmp) / 'evidence.json').write_text('{}')
            row = json.loads((Path(__file__).parent / 'templates/adjudicated.example.json').read_text())[0]
            row.update(status='adjudicated', reviewers=['R1','R2'], evidenceFile='evidence.json', system='test')
            row2 = dict(row, caseId='second', split='held-out', claims=2, supportedClaims=1)
            path.write_text(json.dumps([row,row2]))
            with patch.object(suite, 'write') as capture, patch('builtins.print'):
                suite.score(path)
            results = capture.call_args.args[1]
            self.assertEqual(len(results), 2)
            self.assertIsNone(results[0]['accuracy'])
            self.assertEqual(results[1]['accuracy'], .5)


if __name__ == '__main__':
    unittest.main()
