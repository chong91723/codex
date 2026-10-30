"""Opt-in real browser integration: CODEX_WEB_TEST_URL=http://127.0.0.1:8765.

Every functional request is initiated by the real protocol panel Execute button.
"""
import os
from pathlib import Path
import tempfile
import unittest
import uuid
from browser_client import BrowserNativeClient


@unittest.skipUnless(os.environ.get('CODEX_WEB_TEST_URL'),'Set CODEX_WEB_TEST_URL to test through the actual web page')
class NativeIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='codex-browser-integration-')
        self.client=BrowserNativeClient(os.environ['CODEX_WEB_TEST_URL'],Path(self.temp.name)/'requests.json')
        result=self.client.rpc('initialize',{})
        self.assertIn('result',result);self.client.send({'method':'initialized'})

    def tearDown(self):
        self.client.close();self.temp.cleanup()

    def test_native_model_catalog_and_ephemeral_thread(self):
        models=self.client.rpc('model/list',{})
        self.assertIn('data',models['result'])
        thread=self.client.rpc('thread/start',{'ephemeral':True})
        self.assertTrue(thread['result']['thread']['id'])

    def test_native_filesystem_and_errors(self):
        response=self.client.rpc('fs/readDirectory',{'path':'/tmp'})
        self.assertIsInstance(response['result']['entries'],list)
        invalid=self.client.rpc('fs/readFile',{'path':'/tmp/codex-acceptance-missing-'+uuid.uuid4().hex})
        self.assertIn('error',invalid)

    def test_independent_command_cannot_bypass_thread_admission(self):
        # Native execution stays available inside admitted thread/turn tools.
        # A standalone command RPC has no root ownership and must not bypass
        # the configured per-user execution limit.
        before=self.client.fetch_api('/api/status')['nativeRuntime']['execution']
        response=self.client.rpc('command/exec',{'command':['/usr/bin/printf','CODEX_NATIVE_TOOL_OK'],'timeoutMs':5000})
        self.assertEqual(response['error']['code'],-32002)
        self.assertIn('当前会话',response['error']['message'])
        after=self.client.fetch_api('/api/status')['nativeRuntime']['execution']
        for key in ('ownerThreadId','activeTurns','cleanupHolds','pendingNativeAcks'):
            self.assertEqual(before.get(key),after.get(key))


if __name__=='__main__':unittest.main()
