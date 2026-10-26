// Compatibility entry: run retained native built-in skills and current Flash menu; no custom skill is created or imported.
import {runFlashAcceptance} from './flash_compat_entry.mjs';
await runFlashAcceptance(['skills','menu']);
