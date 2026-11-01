import copy
import unittest
from quality import aggregate, calibration, comparison, evaluate, inventory_request, validate_inventory, validate_review


def case():
    return dict(id='case-1', feedId='feed-1', language='en', interest='Infrastructure',
                windowStart='2026-11-01T08:00:00Z', windowEnd='2026-11-01T09:00:00Z', frozenAt='2026-11-01T09:10:00Z',
                evidenceScope='all_eligible_frozen_input', evidenceComplete=True,
                articles=[dict(id='A', feedId='feed-1', text='The bridge opened on Monday.', completeness='complete'),
                          dict(id='B', feedId='feed-1', text='The airport closed on Tuesday.', completeness='complete')],
                prior=[], items=[dict(headline='Bridge opens', body='The bridge opened on Monday.', sourceIds=['A'])], pipelineStatus='published')


def inventory():
    return dict(developments=[dict(id='D1', text='Bridge opens', importance=3, relation='new', evidence=[dict(sourceId='A', quote='bridge opened')]),
                              dict(id='D2', text='Airport closes', importance=3, relation='new', evidence=[dict(sourceId='B', quote='airport closed')])], limitations=[])


def review():
    return dict(claims=[dict(id='C1', item=0, text='The bridge opened on Monday.', support='supported', citationSupport='supported', evidence=[dict(sourceId='A', quote='bridge opened')], explanation='Explicit source statement')],
                coverage=[dict(developmentId='D1', status='covered', items=[0], explanation='Reported'), dict(developmentId='D2', status='omitted', items=[], explanation='Not reported')],
                items=[dict(item=0, relevance='relevant', repetition='novel', temporal='correct', language='correct', explanation='Relevant English prose')], findings=[], limitations=[])


class QualityTests(unittest.TestCase):
    def test_inventory_excludes_output_includes_uncited_source(self):
        import json
        data = json.loads(inventory_request(case())['user'])
        self.assertNotIn('items', data)
        self.assertEqual(len(data['articles']), 2)

    def test_detects_omission_separately_from_support(self):
        value = evaluate(case(), lambda req, stage: inventory() if stage == 'inventory' else review(), 'judge')
        self.assertEqual(value['metrics']['claimSupport']['value'], 1)
        self.assertEqual(value['metrics']['importantDevelopmentRecall']['value'], .5)
        self.assertEqual(value['status'], 'flagged')

    def test_quotes_must_be_exact_and_scoped(self):
        value = inventory()
        value['developments'][0]['evidence'][0]['quote'] = 'fabricated'
        with self.assertRaises(ValueError):
            validate_inventory(value, case())

    def test_partial_evidence_cannot_support_negative_judgment(self):
        c, r = case(), review()
        c['evidenceComplete'] = False
        r['claims'][0]['support'] = 'unsupported'
        with self.assertRaises(ValueError):
            validate_review(r, c, inventory())

    def test_comparison_freezes_one_inventory_for_all_systems(self):
        calls = []
        def complete(system, req, stage):
            calls.append((system, stage))
            return inventory() if stage == 'inventory' else review()
        reports = comparison({'v3': case(), 'single-llm': copy.deepcopy(case())}, complete, 'judge')
        self.assertEqual(calls.count(('shared_inventory', 'inventory')), 1)
        self.assertEqual(len({r['inventoryHash'] for r in reports}), 1)
        self.assertEqual(len({r['frozenInputHash'] for r in reports}), 1)
        self.assertEqual(len(aggregate(reports)), 2)

    def test_comparison_rejects_different_reader_history(self):
        other = case()
        other['prior'] = [dict(id='prior', at='2026-11-01T07:00:00Z', headline='Old', body='Previously told')]
        with self.assertRaises(ValueError):
            comparison({'v3': case(), 'baseline': other}, lambda *args: None, 'judge')

    def test_partial_cases_excluded_from_full_recall_aggregate(self):
        c = case()
        c['evidenceComplete'] = False
        result = evaluate(c, lambda req, stage: inventory() if stage == 'inventory' else review(), 'judge')
        group = aggregate([result])[0]
        self.assertIsNone(group['metrics']['importantDevelopmentRecall']['value'])
        self.assertEqual(group['incompleteEvidenceCases'], 1)

    def test_calibration_reports_false_alarms_and_misses_by_language(self):
        rows = [dict(caseHash='hash', unitId=str(i), dimension='factual', language=language, labelOrigin='human', adjudicated=True,
                     independent=True, reviewerId='actual-reviewer', humanProblem=human, judgeProblem=judge)
                for i, (language, human, judge) in enumerate([('en', True, True), ('en', True, False), ('en', False, True), ('ar', False, False)])]
        result = {r['language']: r for r in calibration(rows)}
        self.assertEqual(result['en']['missRate']['value'], .5)
        self.assertEqual(result['en']['falseAlarmRate']['value'], 1)
        self.assertIsNone(result['ar']['recall']['value'])

    def test_no_synthetic_or_duplicate_human_gold(self):
        row = dict(caseHash='h', unitId='u', dimension='factual', language='en', labelOrigin='machine', adjudicated=True, independent=True, reviewerId='reviewer', humanProblem=True, judgeProblem=False)
        with self.assertRaises(ValueError):
            calibration([row])
        row['labelOrigin'] = 'human'
        with self.assertRaises(ValueError):
            calibration([row, row])


if __name__ == '__main__':
    unittest.main()
