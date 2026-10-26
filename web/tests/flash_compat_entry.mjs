// Small compatibility adapter; all verification is executed by the current real tests.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function runFlashAcceptance(targets) {
  assert(process.env.CODEX_WEB_URL, 'Missing isolated environment: set CODEX_WEB_URL and CODEX_TEST_WORKSPACE before running Flash acceptance.');
  assert(process.env.CODEX_TEST_WORKSPACE?.startsWith('/tmp/'), 'CODEX_TEST_WORKSPACE must explicitly name the disposable /tmp workspace; no live project is tested.');
  const destination=path.resolve(process.env.REPORT_DIR||process.env.CODEX_TEST_OUTPUT||process.env.ARTIFACT_DIR||'/tmp/codex-web-flash-audit/compatibility');
  const suites={
    menu:{file:'flash_menu_followup_desktop.mjs',report:'menu-results.json',output:'ARTIFACT_DIR'},
    skills:{file:'native_builtin_skills_desktop.mjs',report:'results.json',output:'REPORT_DIR'},
    guardian:{file:'native_flash_conditions_desktop.mjs',report:'results.json',output:'REPORT_DIR'},
    memory:{file:'native_memory_flash_desktop.mjs',report:'results.json',output:'REPORT_DIR'},
  };
  const original={REPORT_DIR:process.env.REPORT_DIR,ARTIFACT_DIR:process.env.ARTIFACT_DIR,MENU_ONLY:process.env.MENU_ONLY,AUDIT_ONLY:process.env.AUDIT_ONLY};
  try {
    for(const name of targets) {
      const suite=suites[name];assert(suite,'Unknown Flash suite: '+name);
      const directory=targets.length===1?destination:path.join(destination,name);
      process.env[suite.output]=directory;
      const requested=original.AUDIT_ONLY||process.env.CODEX_TEST_ONLY||process.env.CODEX_UI_TEST_ONLY;
      if(name==='menu'&&!original.MENU_ONLY&&requested)process.env.MENU_ONLY=requested;
      if(name!=='menu'&&requested)process.env.AUDIT_ONLY=requested;
      console.log('RUN current real Flash suite: '+suite.file);
      await import(new URL('./'+suite.file,import.meta.url));
      const report=JSON.parse(fs.readFileSync(path.join(directory,suite.report),'utf8'));
      assert(report.results?.some(result=>result.status==='passed'),'No checks passed; the requested filter or environment did not run an applicable acceptance check.');
      assert(!report.results.some(result=>result.status==='failed')&&!report.errors?.length,'Real Flash acceptance failed; inspect '+path.join(directory,suite.report));
      if(process.exitCode)throw new Error('Real Flash acceptance returned a failure exit code.');
    }
  } finally {
    for(const [key,value] of Object.entries(original))if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
}
