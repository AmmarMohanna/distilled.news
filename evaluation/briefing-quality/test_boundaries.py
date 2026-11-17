"""Synthetic edge cases only; these are not human judgments or model measurements."""
import copy
import json
import math
import tempfile
import unittest
import warnings
import zipfile
from pathlib import Path

from evaluate import SHA, audit_cases, read_archive, paired_quality, agreement, baseline
from freeze import certify
from runtime import summarize
from study import analyze


class ArchiveTests(unittest.TestCase):
    def archive(self, root, files=None, checksum=None):
        files = files or {'data.json': b'{}'}
        checksum = checksum if checksum is not None else '\n'.join(SHA(body) + '  ' + name for name, body in files.items())
        path = Path(root) / 'fixture.zip'
        with zipfile.ZipFile(path, 'w') as z:
            for name, body in files.items(): z.writestr('export/' + name, body)
            z.writestr('export/SHA256SUMS.txt', checksum)
        return path

    def test_valid_archive_preserves_bytes(self):
        with tempfile.TemporaryDirectory() as root:
            out = Path(root) / 'out'
            self.assertEqual(read_archive(self.archive(root, {'nested/a.json': b'{"ar":"test"}'}), out), 1)
            self.assertEqual((out / 'nested/a.json').read_bytes(), b'{"ar":"test"}')

    def test_unsafe_member_paths_are_rejected_before_extraction(self):
        for name in ['../escape', '/absolute', 'C:/drive', 'nested\\escape', 'nested/../../escape']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as root:
                with self.assertRaises(ValueError): read_archive(self.archive(root, {name: b'x'}), Path(root) / 'out')

    def test_wrong_checksum_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(ValueError, 'Checksum mismatch'):
                read_archive(self.archive(root, checksum='0' * 64 + '  data.json'), Path(root) / 'out')

    def test_uncovered_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            archive = self.archive(root)
            with zipfile.ZipFile(archive, 'a') as z: z.writestr('export/extra', b'uncovered')
            with self.assertRaisesRegex(ValueError, 'Unchecksummed'): read_archive(archive, Path(root) / 'out')

    def test_duplicate_members_are_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            archive = self.archive(root)
            with warnings.catch_warnings():
                warnings.simplefilter('ignore', UserWarning)
                with zipfile.ZipFile(archive, 'a') as z: z.writestr('export/data.json', b'{}')
            with self.assertRaisesRegex(ValueError, 'Duplicate ZIP'): read_archive(archive, Path(root) / 'out')

    def test_duplicate_checksum_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            line = SHA(b'{}') + '  data.json'
            with self.assertRaisesRegex(ValueError, 'Duplicate checksum'):
                read_archive(self.archive(root, checksum=line + '\n' + line), Path(root) / 'out')


def audit_fixture():
    article = dict(id='a', availableAt='2026-10-21T10:00:00Z', publishedAt=None, acquiredAt=None, text='Full evidence', contentCompleteness='UNKNOWN')
    case = dict(_file='a.json', feedId='feed', windowStart='2026-10-21T10:00:00Z', windowEnd='2026-10-21T10:30:00Z', intervalMinutes=30,
                articles=[article], provenance=dict(trackId='track', sequenceIndex=0))
    manifest = dict(tracks=[dict(id='track', feedId='feed', initialHistory=[])])
    snapshot = dict(frozenAt='2026-10-21T11:00:00Z', records=[dict(acquired=dict(id='a', feedId='feed'), receipt=dict(decision='PROMOTED_NEW_REVISION', decidedAt=article['availableAt']))])
    return [case], manifest, snapshot


class WindowTests(unittest.TestCase):
    def test_opening_boundary_included_and_missing_dates_counted(self):
        flags = audit_cases(*audit_fixture())
        self.assertEqual(flags, dict(missing_publishedAt=1, missing_acquiredAt=1, completeness_UNKNOWN=1))

    def test_closing_boundary_excluded(self):
        cases, manifest, snapshot = audit_fixture()
        snapshot['records'][0]['receipt']['decidedAt'] = cases[0]['windowEnd']
        cases[0]['articles'] = []
        self.assertEqual(audit_cases(cases, manifest, snapshot), {})

    def test_invalid_duration_freeze_and_sequence_rejected(self):
        for field, value in [('intervalMinutes', 29), ('windowEnd', '2026-10-21T12:00:00Z'), ('windowEnd', '2026-10-21T10:00:00Z')]:
            with self.subTest(field=field, value=value):
                cases, manifest, snapshot = audit_fixture(); cases[0][field] = value
                with self.assertRaises(ValueError): audit_cases(cases, manifest, snapshot)
        cases, manifest, snapshot = audit_fixture(); cases[0]['provenance']['sequenceIndex'] = 1
        with self.assertRaisesRegex(ValueError, 'sequence'): audit_cases(cases, manifest, snapshot)

    def test_duplicate_evidence_and_future_history_rejected(self):
        cases, manifest, snapshot = audit_fixture(); snapshot['records'] *= 2
        with self.assertRaisesRegex(ValueError, 'Duplicate snapshot'): audit_cases(cases, manifest, snapshot)
        cases, manifest, snapshot = audit_fixture(); manifest['tracks'][0]['initialHistory'] = [dict(at=cases[0]['windowStart'])]
        with self.assertRaisesRegex(ValueError, 'Future history'): audit_cases(cases, manifest, snapshot)


class CertificateTests(unittest.TestCase):
    def fixture(self):
        return dict(archiveSha256='fixture'), [dict(articleA='a', articleB='b')], dict(origin='human', stewardId='S1', reviewedAt='2026-10-28T10:00:00Z', archiveSha256='fixture', crossLanguageAndRelatedDevelopmentsReviewed=True,
            candidateDecisions=[dict(articleA='b', articleB='a', decision='independent', rationale='Synthetic test certificate')])

    def test_complete_certificate_is_deterministic_and_does_not_mutate_inputs(self):
        provisional, candidates, certificate = self.fixture(); original = copy.deepcopy(provisional)
        result = certify(provisional, candidates, certificate)
        self.assertTrue(result['frozen']); self.assertEqual(result, certify(provisional, candidates, certificate)); self.assertEqual(provisional, original)

    def test_wrong_archive_or_missing_semantic_review_rejected(self):
        for change in [dict(archiveSha256='other'), dict(crossLanguageAndRelatedDevelopmentsReviewed=False), dict(origin='ai'), dict(stewardId='')]:
            with self.subTest(change=change):
                provisional, candidates, certificate = self.fixture(); certificate.update(change)
                with self.assertRaises(ValueError): certify(provisional, candidates, certificate)

    def test_missing_duplicate_linked_and_uncertain_decisions_rejected(self):
        for kind in ['missing', 'duplicate', 'linked', 'uncertain', 'no-rationale']:
            with self.subTest(kind=kind):
                provisional, candidates, certificate = self.fixture()
                if kind == 'missing': certificate['candidateDecisions'] = []
                elif kind == 'duplicate': certificate['candidateDecisions'] *= 2
                elif kind == 'no-rationale': certificate['candidateDecisions'][0]['rationale'] = ''
                else: certificate['candidateDecisions'][0]['decision'] = kind
                with self.assertRaises(ValueError): certify(provisional, candidates, certificate)

    def test_additional_cross_split_link_prevents_freeze(self):
        provisional, candidates, certificate = self.fixture(); certificate['additionalCrossSplitLinks'] = [['x','y']]
        with self.assertRaises(ValueError): certify(provisional, candidates, certificate)


def quality_row(**changes):
    return dict(dict(caseId='c', system='v3', cluster='one', language='en', split='development', judgmentOrigin='human', status='adjudicated', reviewers=['R1','R2'], evidenceFile='synthetic-fixture',
                     claims=2, supportedClaims=1, items=2, relevantItems=1, expectedWeight=4, coveredWeight=2, expectedFacts=2, coveredFacts=1, expectedCritical=1, coveredCritical=1, duplicateItems=0, eligibleNovelItems=1, novelItems=1), **changes)


class QualityTests(unittest.TestCase):
    def test_numerators_nonfinite_values_and_reviewer_duplicates_rejected(self):
        for change in [dict(supportedClaims=3), dict(claims=math.nan), dict(items=True), dict(items=1.5), dict(coveredWeight=-1), dict(reviewers=['R1','R1']), dict(evidenceFile=''), dict(coveredCritical=2)]:
            with self.subTest(change=change), self.assertRaises(ValueError): paired_quality([quality_row(**change)], [])

    def test_missing_judgments_stay_missing(self):
        row = quality_row(status='pending')
        result = paired_quality([row], [row]); self.assertEqual(result['aggregates'], []); self.assertEqual(len(result['pending']), 1); self.assertEqual(len(result['missingExpected']), 1)

    def test_reference_denominators_must_match_between_systems(self):
        with self.assertRaisesRegex(ValueError, 'denominator'):
            paired_quality([quality_row(system='a'), quality_row(system='b', expectedFacts=3)], [])

    def test_micro_and_macro_are_distinct(self):
        rows = [quality_row(), quality_row(caseId='other', cluster='two', claims=8, supportedClaims=8)]
        result = paired_quality(rows, [])['aggregates'][0]['metrics']['accuracy']
        self.assertEqual(result['micro'], .9); self.assertEqual(result['macro'], .75)

    def test_bootstrap_is_reproducible_and_uses_independent_components(self):
        rows = [quality_row(caseId=str(i), cluster=str(i), system=system, supportedClaims=1 if system=='a' else 2) for i in range(5) for system in ['a','b']]
        first = paired_quality(rows, []); reordered = paired_quality(list(reversed(rows)), [])
        self.assertEqual(first['pairs'], reordered['pairs']); self.assertEqual(first['aggregates'], reordered['aggregates'])
        accuracy = next(row for row in first['pairs'] if row['metric']=='accuracy')
        self.assertEqual(accuracy['exploratory95ClusterBootstrap'], [.5,.5])

    def test_all_unreviewed_agreement_has_no_invented_score(self):
        rows = [dict(case_id='c', article_id='a', language='en', reviewer=r, status='pending') for r in ['R1','R2']]
        result = agreement(rows, 'relevant', ['yes','no','uncertain'])
        self.assertIsNone(result['kappa']); self.assertIsNone(result['rawAgreement']); self.assertEqual(result['missingPairs'], 1)

    def test_keyword_cap_and_ties_are_deterministic(self):
        articles = [dict(id=str(i), title='transport', text='full body', url=f'https://example.invalid/{i}') for i in range(8)]
        case = dict(interestProfile='transport', articles=articles)
        output = baseline(case, 'keyword'); self.assertEqual(len(output), 5)
        self.assertEqual(output, baseline(dict(case, articles=list(reversed(articles))), 'keyword'))


class StudyBoundaryTests(unittest.TestCase):
    def row(self, condition='manual', **changes):
        return dict(dict(participant_id='synthetic-only', language='en', task_pair='pair', pack='A' if condition=='manual' else 'B', condition=condition,
                         key_version='v1', order='1' if condition=='manual' else '2', status='completed', elapsed_seconds='60' if condition=='manual' else '40',
                         success='true', missed_facts='1', expected_facts='2', correct_answers='2', total_answers='3', usefulness='3', effort='3', source_opens='1'), **changes)

    def test_invalid_observation_categories_are_rejected(self):
        for change in [dict(language='de'),dict(condition='other'),dict(status='unknown'),dict(order='3'),dict(success='yes'),dict(participant_id=''),dict(task_pair='')]:
            with self.subTest(change=change), self.assertRaises(ValueError): analyze([self.row(**change)])

    def test_count_and_rating_boundaries_are_checked(self):
        for change in [dict(missed_facts='3'),dict(correct_answers='4'),dict(source_opens='1.5'),dict(usefulness='0'),dict(effort='6'),dict(elapsed_seconds='-1'),dict(elapsed_seconds='inf')]:
            with self.subTest(change=change), self.assertRaises(ValueError): analyze([self.row(**change)])

    def test_timeout_is_retained_as_a_failure(self):
        result = analyze([self.row(status='timeout',success='false',elapsed_seconds='600')])
        group = result['summaries'][0]
        self.assertEqual(group['statuses'], {'timeout':1}); self.assertEqual(group['successDenominator'], 1); self.assertEqual(group['successNumerator'], 0)
        with self.assertRaises(ValueError): analyze([self.row(status='timeout',success='true')])

    def test_zero_denominators_are_undefined(self):
        result = analyze([self.row(expected_facts='0',missed_facts='0',total_answers='0',correct_answers='0')])
        self.assertIsNone(result['summaries'][0]['metrics']['comprehension']['median'])
        self.assertEqual(result['summaries'][0]['metrics']['missedFactRate']['missing'], 1)

    def test_repeated_tasks_do_not_become_extra_participants(self):
        rows = [self.row(condition,task_pair=pair) for pair in ['one','two'] for condition in ['manual','distilled']]
        result = analyze(rows)
        self.assertEqual(result['uniqueParticipants'], 1); self.assertEqual(len(result['pairs']), 2)
        summary = next(r for r in result['pairedSummaries'] if r['language']=='en' and r['metric']=='time')
        self.assertEqual(summary['participants'], 1); self.assertEqual(summary['medianDelta'], -20)

    def test_multilingual_participants_and_incomplete_pairs_are_reported(self):
        result = analyze([self.row(language='en'),self.row(language='ar')])
        self.assertEqual(result['uniqueParticipants'], 1); self.assertEqual(result['multilingualParticipants'], 1)
        self.assertEqual(len(result['incompletePairs']), 2); self.assertEqual(result['pairs'], [])


class RuntimeTests(unittest.TestCase):
    expected = [dict(caseId='a', language='en', system='v3')]

    def reservation(self, **changes): return dict(dict(id=1, state='RESERVED', language='en', system='v3', reservationUsd=.2), **changes)
    def settlement(self, **changes): return dict(dict(id=1, state='SETTLED', language='en', system='v3', costUsd=.1, inputTokens=10, outputTokens=2), **changes)

    def test_no_calls_or_outputs_preserve_missing_case(self):
        row = summarize([], [], self.expected)[0]
        self.assertEqual(row['missingWindows'], ['a']); self.assertIsNone(row['latencyPublished']['p50Ms']); self.assertIsNone(row['costPerPublishedBriefingUsd'])

    def test_failed_attempts_still_cost_money(self):
        result = summarize([dict(caseId='a', language='en', system='v3', status='failed', latencyMs=40)], [self.reservation(),self.settlement()], self.expected)[0]
        self.assertEqual(result['failures'], 1); self.assertEqual(result['exactTotalCostUsd'], .1); self.assertIsNone(result['costPerPublishedBriefingUsd'])

    def test_duplicate_journal_records_are_rejected(self):
        for calls in [[self.reservation(),self.reservation()], [self.reservation(),self.settlement(),self.settlement()]]:
            with self.subTest(calls=calls), self.assertRaises(ValueError): summarize([], calls, self.expected)

    def test_orphan_settlement_is_rejected(self):
        with self.assertRaises(ValueError): summarize([], [self.settlement()], self.expected)

    def test_nonfinite_negative_and_fractional_usage_rejected(self):
        for change in [dict(costUsd=math.nan),dict(costUsd=-1),dict(inputTokens=-1),dict(outputTokens=1.5)]:
            with self.subTest(change=change), self.assertRaises(ValueError): summarize([], [self.reservation(),self.settlement(**change)], self.expected)

    def test_unplanned_terminal_case_is_rejected(self):
        with self.assertRaises(ValueError): summarize([dict(caseId='unknown',language='en',system='v3',result=dict(status='empty'),latencyMs=0)], [], self.expected)


if __name__ == '__main__': unittest.main()
