# Development scope

These instructions apply to inspecting or modifying this repository's implementation. Database analysis tasks under `workspaces/` use their own analysis instructions; they must not run development tools or maintain development indexes. Do not load the development tool contracts into those analysis conversations.

- Native capability first: whenever the pinned Codex version exposes a usable native capability through an allowed integration, use it. Keep thread/turn execution, planning, approvals, interruption, subagent coordination, model configuration and native memory processing in Codex; the Web app provides controls and presentation. Add analysis MCP behavior only for requirements without an equivalent native capability. Do not replace native behavior with a custom agent or task loop.
- Preserve unrelated working-tree changes. Do not modify `upstream/`, `native/`, credentials, or live business data.
- Keep the existing Python backend, native Codex app-server integration, and plain JavaScript frontend. Do not replace the native agent loop.
- Validate product workflows with `deepseek-flash`; separate offline fixtures, browser checks, protocol checks, and real model results.
- Use isolated workspaces and database fixtures for tests.

# Local development tools

See `LOCAL_DEVELOPMENT_TOOLS.md` for versions, scope, and commands. CodeGraph indexes first-party Web source and tests; AOCI covers only the explicitly configured core architecture subset.

- Before a code change, use CodeGraph exploration and impact queries to locate implementation and related tests. With the existing no-watch setup, run a telemetry-disabled `codegraph sync` after stable source changes; verify important relationships against actual source and tests.
- When starting a development run with an existing AOCI index, call `aoci_rules` and `aoci_overview` unless the current matching contract and complete cognition are already reliable. Follow the live contract for chunk continuation, delivery confirmation, attestation, and context-compaction recovery. Do not reconstruct these protocols from stale notes.
- After managed files reach a stable state, call `aoci_maintain` once. Author complete entries from actual source evidence, preserve machine-issued bindings, and follow the returned Guide through validation and alignment. Do not fabricate receipts, reset Baseline to hide drift, or repeatedly maintain already aligned content.
- If MCP tools are not loaded in the current programming session, the installed CLI and `aoci --repo /root/Codex index agent guide --agent codex --json` provide the supported workflow. New programming sessions load the desktop MCP configuration.

The detailed AOCI contract is obtained on demand through `aoci_rules`, rather than copied into this parent directory's instructions. Developer indexes, model self-assessments, and structural call graphs do not prove business definitions or runtime correctness.
