import unittest
from analyze import pooled,compare
class AnalysisTests(unittest.TestCase):
 def test_undefined_and_failures_are_not_perfect_scores(self):
  self.assertIsNone(pooled([{'status':'failed'}],'m')['value'])
  r=pooled([{'status':'completed','metrics':{'m':{'numerator':0,'denominator':0}}},{'status':'failed'}],'m')
  self.assertIsNone(r['value']);self.assertEqual(r['failedAssessments'],1)
 def test_paired_only_same_windows_and_resolved_metrics(self):
  def r(v):return {'status':'completed','metrics':{'m':{'value':v}}}
  a={'x':r(1),'y':r(None),'extra':r(0)};b={'x':r(.5),'y':r(1),'other':r(1)}
  c=compare(a,b,'m');self.assertEqual(c['pairedWindows'],1);self.assertEqual(c['meanDifference'],.5);self.assertIsNone(c['confidenceInterval'])
if __name__=='__main__':unittest.main()