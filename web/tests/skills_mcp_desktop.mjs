// Compatibility entry: Current native built-in skill execution and menu/MCP status navigation. Historical custom-skill import and slow-MCP race fixtures are not current acceptance.
import {runFlashAcceptance} from './flash_compat_entry.mjs';
await runFlashAcceptance(["skills", "menu"]);
