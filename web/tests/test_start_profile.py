"""Provider catalog regression: native collab must use actual provider capabilities."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from start import deepseek_profile

class ProviderProfileTests(unittest.TestCase):
    def test_generated_catalog_uses_native_plaintext_collaboration(self):
        with tempfile.TemporaryDirectory() as directory:
            profile=deepseek_profile(Path(directory))
            models=json.loads((profile/'models.json').read_text())['models']
            flash=next(model for model in models if model['slug']=='deepseek-flash')
            self.assertEqual(flash['multi_agent_version'],'v1')
            self.assertFalse(any(model['slug'].startswith('gpt-') for model in models))
            self.assertTrue(all(model['multi_agent_version']=='v1' for model in models))

    def test_regeneration_corrects_catalog_without_rewriting_user_config(self):
        with tempfile.TemporaryDirectory() as directory:
            profile=Path(directory)
            config='model = "my-configured-model"\nmodel_provider = "custom"\n'
            (profile/'config.toml').write_text(config)
            (profile/'models.json').write_text(json.dumps({'models':[{'slug':'deepseek-flash','multi_agent_version':'v2'}]}))
            deepseek_profile(profile)
            self.assertEqual((profile/'config.toml').read_text(),config)
            self.assertEqual(json.loads((profile/'models.json').read_text())['models'][0]['multi_agent_version'],'v1')

if __name__=='__main__':
    unittest.main()
