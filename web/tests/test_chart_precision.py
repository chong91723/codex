"""Real local ECharts MCP options; synthetic exact values, no model or DB."""
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'database'))
from charts import build_chart
from cancellation import Cancellation

class ChartPrecision(unittest.TestCase):
    def chart(self,value,kind='bar'):
        return build_chart({'resultId':'a'*32,'columns':[{'name':'label','type':'string'},{'name':'amount','type':'number'}],
            'rows':[{'label':'Fixture','amount':value}],'rowCount':1,'createdAt':'fixture','truncated':False},kind,'label',['amount'],'Fixture',Cancellation())

    def test_lossy_values_keep_exact_ordinal_tooltip_and_explicit_notice(self):
        for value in ['9007199254740993','0.12345678901234567890123456789','-9007199254740993']:
            with self.subTest(value=value):
                chart=self.chart(value);key=chart['exactDimensions']['amount']
                self.assertEqual(chart['option']['dataset']['source'][0][key],value)
                self.assertIn(key,chart['option']['series'][0]['encode']['tooltip'])
                self.assertIn({'name':key,'displayName':'amount','type':'ordinal'},chart['option']['dataset']['dimensions'])
                self.assertEqual(chart['rows'][0]['amount'],value)
                self.assertIn('近似',chart['precisionNotice'])

    def test_safe_values_and_null_keep_display_precision_without_warning(self):
        for value in ['9007199254740991','3.50',None]:
            with self.subTest(value=value):
                chart=self.chart(value);key=chart['exactDimensions']['amount']
                self.assertEqual(chart['option']['dataset']['source'][0][key],value)
                self.assertIsNone(chart['precisionNotice'])
