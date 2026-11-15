import unittest
from funded_analysis import confusion
class FailureAwareTests(unittest.TestCase):
 def test_failed_and_uncertain_assessments_remain_in_denominator(self):
  x=confusion([(True,True,'a'),(True,None,'b'),(False,'failed','c'),(False,False,'d')])
  self.assertEqual((x['TP'],x['TN'],x['abstainedPositive'],x['failedNegative']),(1,1,1,1))
  self.assertEqual(x['total'],4);self.assertEqual(x['failureAwareRecallBounds'],[.5,1.0])
 def test_false_positive_and_false_negative_are_not_discarded(self):
  x=confusion([(True,False,'a'),(False,True,'b')]);self.assertEqual((x['FN'],x['FP'],x['F1']),(1,1,0))
if __name__=='__main__':unittest.main()
