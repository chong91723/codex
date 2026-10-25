| 原生方法 | 网页入口 | 实际 RPC 证据 | 说明 |
|---|---|---|---|
| `account/bedrock/checkGovCloudRequirements` | 有 | returned |  |
| `account/bedrock/discover` | 有 | returned |  |
| `account/bedrock/setup` | 有 | native_error_or_blocked | AWS credentials/provider prerequisite is unavailable; DeepSeek is independently tested. |
| `account/gatewayOAuth/cancel` | 有 | returned |  |
| `account/gatewayOAuth/login` | 有 | native_error_or_blocked | Current DeepSeek provider does not use gateway OAuth. |
| `account/gatewayOAuth/read` | 有 | returned |  |
| `account/login/cancel` | 有 | returned |  |
| `account/login/start` | 有 | returned |  |
| `account/logout` | 有 | returned |  |
| `account/rateLimitResetCredit/consume` | 有 | user_requested_skip |  |
| `account/rateLimits/read` | 有 | returned |  |
| `account/read` | 有 | returned |  |
| `account/sendAddCreditsNudgeEmail` | 有 | user_requested_skip |  |
| `account/usage/read` | 有 | returned |  |
| `account/workspaceMessages/read` | 有 | native_error_or_blocked | Authenticated native service request timed out. |
| `app/installed` | 有 | returned |  |
| `app/list` | 有 | returned |  |
| `app/read` | 有 | returned |  |
| `collaborationMode/list` | 有 | returned |  |
| `command/exec` | 有 | returned |  |
| `command/exec/resize` | 有 | returned |  |
| `command/exec/terminate` | 有 | returned |  |
| `command/exec/write` | 有 | returned |  |
| `config/batchWrite` | 有 | returned |  |
| `config/mcpServer/reload` | 有 | returned |  |
| `config/read` | 有 | returned |  |
| `config/value/write` | 有 | returned |  |
| `configRequirements/read` | 有 | returned |  |
| `environment/add` | 有 | returned |  |
| `environment/info` | 有 | returned |  |
| `environment/status` | 有 | returned |  |
| `experimentalFeature/enablement/set` | 有 | returned |  |
| `experimentalFeature/list` | 有 | returned |  |
| `externalAgentConfig/detect` | 有 | returned |  |
| `externalAgentConfig/import` | 有 | returned |  |
| `externalAgentConfig/import/readHistories` | 有 | returned |  |
| `externalAgentConfig/import/recordHistory` | 有 | returned |  |
| `feedback/save` | 有 | returned |  |
| `feedback/upload` | 有 | user_requested_skip |  |
| `fs/copy` | 有 | returned |  |
| `fs/createDirectory` | 有 | returned |  |
| `fs/getMetadata` | 有 | returned |  |
| `fs/readDirectory` | 有 | returned |  |
| `fs/readFile` | 有 | returned |  |
| `fs/remove` | 有 | returned |  |
| `fs/unwatch` | 有 | returned |  |
| `fs/watch` | 有 | returned |  |
| `fs/writeFile` | 有 | returned |  |
| `fuzzyFileSearch` | 有 | returned |  |
| `fuzzyFileSearch/sessionStart` | 有 | returned |  |
| `fuzzyFileSearch/sessionStop` | 有 | returned |  |
| `fuzzyFileSearch/sessionUpdate` | 有 | returned |  |
| `hooks/list` | 有 | returned |  |
| `initialize` | 有 | returned |  |
| `marketplace/add` | 有 | returned |  |
| `marketplace/remove` | 有 | returned |  |
| `marketplace/upgrade` | 有 | returned |  |
| `mcpServer/event/stream/start` | 有 | native_error_or_blocked | Native subscriptions require hosted apps. A standalone MCP server is not a hosted app. |
| `mcpServer/event/stream/stop` | 有 | returned |  |
| `mcpServer/oauth/login` | 有 | returned |  |
| `mcpServer/resource/read` | 有 | returned |  |
| `mcpServer/tool/call` | 有 | returned |  |
| `mcpServerStatus/list` | 有 | returned |  |
| `memory/reset` | 有 | returned |  |
| `memory/status` | 有 | returned |  |
| `mock/experimentalMethod` | 有 | returned |  |
| `model/list` | 有 | returned |  |
| `modelProvider/capabilities/read` | 有 | returned |  |
| `permissionProfile/list` | 有 | returned |  |
| `plugin/install` | 有 | returned |  |
| `plugin/installed` | 有 | returned |  |
| `plugin/list` | 有 | returned |  |
| `plugin/read` | 有 | returned |  |
| `plugin/reconcile` | 有 | returned |  |
| `plugin/search` | 有 | returned |  |
| `plugin/share/checkout` | 有 | native_error_or_blocked | The private fixture is not available for checkout in personal space. |
| `plugin/share/delete` | 有 | native_error_or_blocked | Native workspace delete endpoint rejects personal space. One PRIVATE test fixture still needs cleanup. |
| `plugin/share/list` | 有 | returned |  |
| `plugin/share/save` | 有 | returned |  |
| `plugin/share/updateTargets` | 有 | native_error_or_blocked | Native backend requires an active workspace; current account has personal space only. |
| `plugin/skill/read` | 有 | native_error_or_blocked | Remote shared plugin needs an accessible hosted plugin; local plugin skill is exercised separately. |
| `plugin/uninstall` | 有 | returned |  |
| `process/kill` | 有 | returned |  |
| `process/resizePty` | 有 | returned |  |
| `process/spawn` | 有 | returned |  |
| `process/writeStdin` | 有 | returned |  |
| `project/create` | 有 | returned |  |
| `project/delete` | 有 | returned |  |
| `project/import` | 有 | returned |  |
| `project/list` | 有 | returned |  |
| `project/move` | 有 | returned |  |
| `project/read` | 有 | returned |  |
| `project/update` | 有 | returned |  |
| `remoteControl/client/list` | 有 | returned |  |
| `remoteControl/client/revoke` | 有 | native_error_or_blocked | No disposable paired remote client is available; existing user clients were not revoked. |
| `remoteControl/disable` | 有 | returned |  |
| `remoteControl/enable` | 有 | returned |  |
| `remoteControl/pairing/start` | 有 | returned |  |
| `remoteControl/pairing/status` | 有 | returned |  |
| `remoteControl/status/read` | 有 | returned |  |
| `review/start` | 有 | returned |  |
| `rollout/compress` | 有 | returned |  |
| `server/diagnostics` | 有 | returned |  |
| `skills/config/write` | 有 | returned |  |
| `skills/extraRoots/set` | 有 | returned |  |
| `skills/list` | 有 | returned |  |
| `thread/approveGuardianDeniedAction` | 有 | returned | Verified using a real DeepSeek denial, the web confirmation button and newly persisted guardian.approved_action context. |
| `thread/archive` | 有 | returned |  |
| `thread/attachment/add` | 有 | returned |  |
| `thread/attachment/list` | 有 | returned |  |
| `thread/attachment/remove` | 有 | returned |  |
| `thread/attachmentOwner/list` | 有 | returned |  |
| `thread/backgroundTerminals/clean` | 有 | returned |  |
| `thread/backgroundTerminals/list` | 有 | returned |  |
| `thread/backgroundTerminals/terminate` | 有 | returned |  |
| `thread/compact/start` | 有 | returned |  |
| `thread/decrement_elicitation` | 有 | returned |  |
| `thread/delete` | 有 | returned |  |
| `thread/fork` | 有 | returned |  |
| `thread/goal/clear` | 有 | returned |  |
| `thread/goal/get` | 有 | returned |  |
| `thread/goal/set` | 有 | returned |  |
| `thread/increment_elicitation` | 有 | returned |  |
| `thread/inject_items` | 有 | returned |  |
| `thread/items/list` | 有 | returned |  |
| `thread/items/read` | 有 | returned |  |
| `thread/list` | 有 | returned |  |
| `thread/loaded/list` | 有 | returned |  |
| `thread/memory/read` | 有 | returned |  |
| `thread/memoryMode/set` | 有 | returned |  |
| `thread/metadata/update` | 有 | returned |  |
| `thread/name/set` | 有 | returned |  |
| `thread/prediction/request` | 有 | native_error_or_blocked | Official source returns not implemented yet. |
| `thread/queue/add` | 有 | returned |  |
| `thread/queue/delete` | 有 | returned |  |
| `thread/queue/list` | 有 | returned |  |
| `thread/queue/reorder` | 有 | returned |  |
| `thread/queue/start` | 有 | returned |  |
| `thread/queue/update` | 有 | returned |  |
| `thread/read` | 有 | returned |  |
| `thread/readState/update` | 有 | returned |  |
| `thread/realtime/appendAudio` | 有 | returned |  |
| `thread/realtime/appendSpeech` | 有 | returned |  |
| `thread/realtime/appendText` | 有 | returned |  |
| `thread/realtime/listVoices` | 有 | returned |  |
| `thread/realtime/start` | 有 | returned |  |
| `thread/realtime/stop` | 有 | returned |  |
| `thread/resume` | 有 | returned |  |
| `thread/revert` | 有 | returned |  |
| `thread/sample` | 有 | returned |  |
| `thread/sample/cancel` | 有 | returned |  |
| `thread/search` | 有 | returned |  |
| `thread/searchOccurrences` | 有 | returned |  |
| `thread/section/move` | 有 | returned |  |
| `thread/settings/update` | 有 | returned |  |
| `thread/shellCommand` | 有 | returned |  |
| `thread/start` | 有 | returned |  |
| `thread/timeline/list` | 有 | returned |  |
| `thread/turns/list` | 有 | returned |  |
| `thread/unarchive` | 有 | returned |  |
| `thread/unsubscribe` | 有 | returned |  |
| `threadSection/create` | 有 | returned |  |
| `threadSection/delete` | 有 | returned |  |
| `threadSection/list` | 有 | returned |  |
| `threadSection/update` | 有 | returned |  |
| `turn/interrupt` | 有 | returned |  |
| `turn/settings/update` | 有 | returned |  |
| `turn/start` | 有 | returned |  |
| `turn/steer` | 有 | returned |  |
| `userVerification/cancel` | 有 | returned |  |
| `userVerification/delete` | 有 | native_error_or_blocked | Native build/account returns providerUnavailable. |
| `userVerification/enroll` | 有 | native_error_or_blocked | Native build/account returns providerUnavailable. |
| `userVerification/status` | 有 | returned |  |
| `userVerification/verify` | 有 | native_error_or_blocked | Native build/account returns providerUnavailable. |
| `windowsSandbox/readiness` | 有 | returned | Windows only. Three Linux sandbox enforcement tests passed through web buttons. |
| `windowsSandbox/setupStart` | 有 | returned | Windows only; native asynchronous setup completed with success=false on Linux. |
