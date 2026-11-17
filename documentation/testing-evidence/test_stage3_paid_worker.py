import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('paid_worker',Path(__file__).with_name('stage3-paid-worker.py'))
worker=importlib.util.module_from_spec(spec); spec.loader.exec_module(worker)

class BudgetSafety(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.folder=Path(self.tmp.name)
        self.manifest={'twitter_targets':[{'id':'nasa','kind':'x_profile','input':'NASA'}]}
    def tearDown(self): self.tmp.cleanup()
    @patch.dict('os.environ',{'TWITTERAPI_IO_KEY':'test'})
    def test_uncertain_request_is_not_retried(self):
        out=self.folder/'twitter-r000'; out.mkdir()
        worker.claim(out/'nasa-submitted.json',{'reserved_usd':.02})
        with patch.object(worker,'get') as api:
            worker.twitter_round(self.folder,self.folder,0,self.manifest)
            api.assert_not_called()
    @patch.dict('os.environ',{'TWITTERAPI_IO_KEY':'test'})
    def test_total_reservations_stop_further_calls(self):
        for i in range(21):
            out=self.folder/f'twitter-r{i:03}'; out.mkdir()
            for j in range(10): worker.claim(out/f'target{j}-submitted.json',{'reserved_usd':.02})
        with patch.object(worker,'get') as api:
            worker.twitter_round(self.folder,self.folder,0,self.manifest)
            api.assert_not_called()
        self.assertTrue((self.folder/'twitter-HALTED.json').exists())
    @patch.dict('os.environ',{'TWITTERAPI_IO_KEY':'test'})
    def test_timeout_keeps_marker_and_halts(self):
        with patch.object(worker,'get',side_effect=[{'recharge_credits':10000},TimeoutError('timeout')]) as api:
            worker.twitter_round(self.folder,self.folder,0,self.manifest)
            self.assertEqual(api.call_count,2)
        self.assertTrue((self.folder/'twitter-r000/nasa-submitted.json').exists())
        self.assertTrue((self.folder/'twitter-HALTED.json').exists())
    @patch.dict('os.environ',{'TWITTERAPI_IO_KEY':'test'})
    def test_low_credit_prevents_paid_request(self):
        with patch.object(worker,'get',return_value={'recharge_credits':100}) as api:
            worker.twitter_round(self.folder,self.folder,0,self.manifest)
            self.assertEqual(api.call_count,1)
        self.assertFalse((self.folder/'twitter-r000/nasa-submitted.json').exists())

if __name__=='__main__': unittest.main()
