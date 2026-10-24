# Validation for this handoff

Current packaging run, October 23, 2026 (Eastern):
- Executed `node --test packages/adventure-projects-client/test/*.test.js` against the source.
- 18 tests passed. The remaining HTTP demo integration test failed with `listen EPERM` because the execution environment forbids binding a loopback listener. This is not a clean 19/19 run for this handoff.
- Canonical JS SDK and website's vendored JS SDK matched byte-for-byte before packaging.
- No live upstream calls or full website builds were repeated for packaging.
- Archive integrity, manifest hashes and presence of both source trees are checked during packaging.

Historical checks in packages/adventure-projects-client/docs/verification.md report 19 passing tests in a network-enabled runtime, successful strict TypeScript checking and ten successful live calls. Those records are preserved as historical evidence and are separate from today's packaging checks.

## Good Outside and repository reorganization
- Restored all four gzip snapshots and verified 44,692 records; compressed bytes matched the original JSON before packaging.
- Planner tests.mjs passed, including discovery, services, near-term dates, bookmarks and map-language checks.
- database-tests.mjs, job-tests.mjs and directory-tests.mjs passed. ingestion-tests.mjs passed all 7 tests.
- Tests ran against the reorganized source. Existing source-workspace dependencies were temporarily linked for TypeScript-dependent tests, then the link was removed. Clean dependency installation and full application builds were not repeated.
- Canonical and Trail Desk vendored client files match.
- Live health reported 44,692 active records and zero stale at inspection; this does not transfer the hosted DB or schedules.

## External snapshots
- Snapshot integrity/manifest tests: 4 passed.
- R2 service deployed; all four snapshot uploads returned expected hashes.
- Public downloader ran successfully and verified 44,692 records against the pinned manifest.
- Unauthenticated upload returned HTTP 401.
- No destination D1 import was triggered during this storage migration; the original DB remains unchanged.
