import json
import math
import unittest
from evaluate import instant, canonical_url, agreement, paired_quality, number, baseline
from study import analyze
from challenges import synthetic
from runtime import summarize
from freeze import certify


class AuditTests(unittest.TestCase):
    def test_timestamp_offsets_are_compared_as_instants(self):
        self.assertEqual(instant('2026-10-21T13:30:00+03:00'),instant('2026-10-21T10:30:00Z'))
        with self.assertRaises(ValueError):instant('2026-10-21T10:30:00')

    def test_normalized_url(self):
        self.assertEqual(canonical_url('https://EXAMPLE.org/a/?utm_source=x#top'),'https://example.org/a')
        self.assertNotEqual(canonical_url('https://example.org/a?id=1'),canonical_url('https://example.org/a?id=2'))

    def test_nan_infinity_boolean_rejected(self):
        for x in [math.nan,math.inf,True,-1]:
            with self.assertRaises(ValueError):number(x,'test')

    def test_agreement_uses_original_reviewers_and_reports_missing(self):
        rows=[dict(case_id='a',article_id='1',language='fr',reviewer=r,relevant=v,status='reviewed') for r,v in [('R1','yes'),('R2','yes')]]
        rows += [dict(case_id='b',article_id='2',language='fr',reviewer='R1',relevant='no',status='reviewed')]
        result=agreement(rows,'relevant',['yes','no','uncertain'])
        self.assertEqual(result['paired'],1);self.assertEqual(result['missingPairs'],1)
        self.assertEqual(result['rawAgreement'],1);self.assertIsNone(result['kappa'])
        rows.append(dict(rows[0]))
        with self.assertRaises(ValueError):agreement(rows,'relevant',['yes','no'])

    def test_weighted_kappa_partial_disagreement(self):
        rows=[]
        for i,(a,b) in enumerate([('0','0'),('1','2'),('3','3')]):
            for r,v in [('R1',a),('R2',b)]:rows.append(dict(case_id=str(i),article_id=str(i),language='en',reviewer=r,importance=v,status='reviewed'))
        r=agreement(rows,'importance',['0','1','2','3'],True)
        self.assertGreater(r['kappa'],0);self.assertLess(r['kappa'],1)

    def test_missing_quality_is_not_zero_or_perfect(self):
        r=paired_quality([], [{'caseId':'a','system':'v3','judgmentOrigin':'human'}])
        self.assertEqual(len(r['missingExpected']),1);self.assertEqual(r['aggregates'],[])

    def test_quality_keeps_origins_separate_and_cluster_uncertainty_honest(self):
        rows=[]
        for origin in ('human','ai'):
            for system in ('a','b'):
                row=dict(caseId='c',system=system,cluster='one',language='ar',split='development',judgmentOrigin=origin,status='adjudicated',reviewers=['R1','R2'],evidenceFile='x',
                         claims=2,supportedClaims=1 if system=='a' else 2,items=1,relevantItems=1,expectedWeight=3,coveredWeight=3,
                         expectedFacts=1,coveredFacts=1,expectedCritical=1,coveredCritical=1,duplicateItems=0,eligibleNovelItems=0,novelItems=0)
                rows.append(row)
        r=paired_quality(rows,[])
        self.assertEqual(len(r['aggregates']),4)
        accuracy=[x for x in r['pairs'] if x['metric']=='accuracy']
        self.assertTrue(all(x['meanClusterDelta']==.5 for x in accuracy))
        self.assertTrue(all(x['exploratory95ClusterBootstrap'] is None for x in accuracy))
        self.assertTrue(all(x['metrics']['novelty']['micro'] is None for x in r['aggregates']))

    def test_baseline_fallback_preserves_full_evidence_instead_of_old_280char_cut(self):
        c=synthetic()[0];c['articles']=[dict(c['articles'][0],title=None,text='x'*900)]
        self.assertEqual(len(baseline(c,'all-headlines')[0]['body']),900)

    def test_synthetic_categories_separate(self):
        cases=synthetic()
        self.assertEqual(len(cases),10)
        self.assertTrue(all(c['measurementClass']=='synthetic_adversarial' for c in cases))

    def test_no_semantic_freeze_without_real_steward(self):
        with self.assertRaises(ValueError):certify({'archiveSha256':'x'},[],{'origin':'ai'})

    def test_failed_attempt_costs_and_unknowns_remain_in_denominator(self):
        row=dict(language='en',system='v3',caseId='a',result={'status':'published'},latencyMs=100)
        calls=[dict(id=1,state='RESERVED',language='en',system='v3',reservationUsd=.2),
               dict(id=1,state='SETTLED',language='en',system='v3',costUsd=.1,inputTokens=100,outputTokens=10),
               dict(id=2,state='RESERVED',language='en',system='v3',reservationUsd=.2)]
        r=summarize([row],calls,[dict(language='en',system='v3',caseId='a')])[0]
        self.assertIsNone(r['costPerPublishedBriefingUsd'])
        self.assertEqual(r['knownCostUsdIncludingFailedBriefings'],.1)
        self.assertEqual(r['costPerPublishedBriefingBoundsUsd'],[.1,.1+.2])


class StudyTests(unittest.TestCase):
    def row(self,condition='manual'):
        return dict(participant_id='test-only',language='fr',condition=condition,pack='A' if condition=='manual' else 'B',task_pair='p',key_version='v1',
                    order='1' if condition=='manual' else '2',status='completed',elapsed_seconds='60' if condition=='manual' else '40',success='true',
                    missed_facts='1',expected_facts='2',correct_answers='2',total_answers='3',usefulness='3',effort='3',source_opens='1')

    def test_paired_time_and_missing_denominators(self):
        a,b=self.row(),self.row('distilled');b['total_answers']=''
        r=analyze([a,b]);self.assertEqual(r['pairs'][0]['time'],-20)
        self.assertIsNone(r['pairs'][0]['comprehension'])

    def test_bad_pairing_and_duplicate_rejected(self):
        a,b=self.row(),self.row('distilled')
        for change in [dict(pack='A'),dict(order='1'),dict(key_version='different')]:
            with self.assertRaises(ValueError):analyze([a,dict(b,**change)])
        with self.assertRaises(ValueError):analyze([a,a])

    def test_withdrawal_and_nan_not_silently_dropped(self):
        with self.assertRaises(ValueError):analyze([dict(self.row(),elapsed_seconds='nan')])
        with self.assertRaises(ValueError):analyze([dict(self.row(),status='withdrawn')])
        r=analyze([dict(self.row(),status='withdrawn',missing_reason='test fixture',elapsed_seconds='',success='')])
        self.assertEqual(r['observations'],1)
        self.assertEqual(r['summaries'][2]['missingSuccess'],1)

    def test_empty_study_has_no_invented_participants(self):
        self.assertEqual(analyze([])['uniqueParticipants'],0)


if __name__=='__main__':unittest.main()
