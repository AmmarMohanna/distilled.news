import unittest
from final_report import public_metadata,summarize
class ReportTests(unittest.TestCase):
 def test_public_metadata_removes_private_evidence_and_prose(self):
  raw={'metrics':{'value':.5,'numerator':1,'denominator':2},'findings':[{'category':'citation','explanation':'private reviewer prose','evidence':[{'sourceId':'a','quote':'private retained article text'}]}],'path':'C:/private/artifact'}
  result=public_metadata(raw);self.assertEqual(result['metrics'],raw['metrics']);self.assertEqual(result['findings'][0]['category'],'citation');self.assertNotIn('quote',result['findings'][0]['evidence'][0]);self.assertNotIn('explanation',result['findings'][0]);self.assertNotIn('path',result);self.assertTrue(result['privateArtifact'])
 def test_failed_or_empty_evaluation_is_not_perfect(self):
  rows=[{'id':'bad','status':'failed','error':'provider rejected'},{'id':'quiet','status':'completed','metrics':{'claimSupport':{'numerator':0,'denominator':0,'value':None}}}]
  r=summarize(rows);self.assertEqual(r['available'],1);self.assertEqual(r['failed'],1);self.assertIsNone(r['metrics']['claimSupport']['value'])
 def test_pools_real_denominators_not_average_of_percentages(self):
  r=summarize([{'status':'completed','metrics':{'claimSupport':{'numerator':1,'denominator':1,'value':1}}},{'status':'completed','metrics':{'claimSupport':{'numerator':0,'denominator':9,'value':0}}}]);self.assertEqual(r['metrics']['claimSupport']['value'],.1)
if __name__=='__main__':unittest.main()
