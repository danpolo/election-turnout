import unittest
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import update_live as m

class IngestTests(unittest.TestCase):
    def test_reject_non_official(self):
        self.assertFalse(m.allowed('https://cdn-votes26.bechirot.gov.il/files/expc.csv'))
        self.assertFalse(m.allowed('https://mapvotes.bechirot.gov.il.evil.net/a'))
        self.assertTrue(m.allowed('https://mapvotes.bechirot.gov.il/data/votes/a.json'))
    def test_govmap_aggregate(self):
        j={'features': {str(i): {'בזב':3000, 'מצביעים':450} for i in range(1,51)}}
        rows,_=m.parse_turnout(__import__('json').dumps(j).encode())
        self.assertEqual(len(rows),50)
        self.assertEqual(sum(r['voters'] for r in rows),22500)
    def test_station_overrides_city(self):
        j={'records':[{'code':str(i),'eligible':3000,'voters':1200} for i in range(1,51)]+
            [{'code':'1','ballotNumber':'1','eligible':100,'voters':5},
             {'code':'1','ballotNumber':'2','eligible':100,'voters':6}]}
        rows,_=m.parse_turnout(__import__('json').dumps(j).encode())
        self.assertEqual(next(r for r in rows if r['code']=='1')['voters'],11)
    def test_reject_test_payload(self):
        with self.assertRaises(ValueError):m.parse_turnout(b'{"test":true,"rows":[]}')
    def test_reject_test_count(self):
        with self.assertRaises(ValueError):m.parse_count('סמל ישוב,מחל\n1,2\n'.encode())

if __name__=='__main__':unittest.main()