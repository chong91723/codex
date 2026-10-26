// Compatibility entry: Current Flash UI/menu acceptance. Run flash_compaction_followup_desktop.mjs explicitly for manual/automatic compaction.
import {runFlashAcceptance} from './flash_compat_entry.mjs';
await runFlashAcceptance(["menu"]);
