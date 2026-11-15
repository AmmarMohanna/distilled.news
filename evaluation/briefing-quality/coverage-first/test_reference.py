import unittest
from reference import matches,assess
class ReferenceTests(unittest.TestCase):
 def test_paraphrases_and_false_quantities(self):
  f=dict(id='ferry',anchors=[['Oak'],['2']],actions=['added','extra','أضاف'])
  self.assertTrue(matches('Two extra boats serve Oak.',f));self.assertTrue(matches('أضاف المشغل قاربين إلى Oak.',f));self.assertFalse(matches('12 extra boats serve Oak.',f))
 def test_negation_and_missing_conditions(self):
  f=dict(id='grant',anchors=[['Oak'],['40000']],actions=['conditional','audit','بشرط'])
  self.assertTrue(matches('A $40,000 grant for Oak was approved, conditional on an audit.',f));self.assertFalse(matches('An Oak grant of 40,000 was not approved after an audit.',f));self.assertFalse(matches('Oak received an approved 40,000 grant.',f))
 def test_development_paraphrases_do_not_require_literal_correction_label(self):
  f=dict(id='withdraw',anchors=[['Oak']],actions=['correction','earlier announcement'])
  self.assertTrue(matches('Council has not approved an Oak repair grant; earlier announcement was an error.',f))
 def test_rejects_lost_negation_and_false_correction_predicate(self):
  plan=dict(id='plan',anchors=[['Oak']],actions=['proposed'])
  self.assertFalse(matches('The council proposed and approved the Oak bus route.',plan))
  correction=dict(id='correct',anchors=[['Oak'],['7']],actions=['Correction'])
  self.assertFalse(matches('Correction: 7 pumps were installed at Oak.',correction))
 def test_unmatched_is_not_labeled_false(self):
  r=assess(dict(expected=[],nonNovel=[]),dict(status='failed'))
  self.assertEqual(r['eligible'],0);self.assertEqual(r['matched'],0);self.assertIn('unresolved',r['scope'])
if __name__=='__main__':unittest.main()