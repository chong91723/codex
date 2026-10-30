"""Declared MySQL BIT conversion preserves exact values and unrelated binary data."""
import sys,unittest
from pathlib import Path
from unittest.mock import patch,MagicMock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'database'))
from adapters import Mysql,mysql_bit,dataset

class MysqlBits(unittest.TestCase):
    def test_declared_bit_driver_converter_and_blob_stays_binary(self):
        import pymysql
        from pymysql.constants import FIELD_TYPE
        original=pymysql.converters.conversions[FIELD_TYPE.BIT]
        connection=MagicMock();connection.cursor.return_value.__enter__.return_value.fetchall.return_value=[('GRANT SELECT ON fixture.* TO reader',)]
        config={'host':'127.0.0.1','port':3306,'username':'reader','password':'','database':'fixture','tls':False}
        with patch.object(pymysql,'connect',return_value=connection) as connect:Mysql(config)
        converter=connect.call_args.kwargs['conv'][FIELD_TYPE.BIT]
        self.assertIs(converter,mysql_bit)
        self.assertIs(pymysql.converters.conversions[FIELD_TYPE.BIT],original)
        for raw,expected in [(b'\x00',0),(b'\x01',1),(b'\x80',128),(b'\xff'*8,2**64-1)]:
            with self.subTest(raw=raw):self.assertEqual(converter(raw),expected)
        columns,rows=dataset(['flag','blob'],[(converter(b'\x01'),b'\x01')])
        self.assertEqual([c['nativeType'] for c in columns],['int','bytes'])
        self.assertEqual(rows,[{'flag':1,'blob':'AQ=='}])

if __name__=='__main__':unittest.main()
