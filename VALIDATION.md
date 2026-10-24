# Validation for this handoff

Current packaging run, October 23, 2026 (Eastern):
- Executed `node --test adventure-projects-client/test/*.test.js` against the source.
- 18 tests passed. The remaining HTTP demo integration test failed with `listen EPERM` because the execution environment forbids binding a loopback listener. This is not a clean 19/19 run for this handoff.
- Canonical JS SDK and website's vendored JS SDK matched byte-for-byte before packaging.
- No live upstream calls or full website builds were repeated for packaging.
- Archive integrity, manifest hashes and presence of both source trees are checked during packaging.

Historical checks in adventure-projects-client/docs/verification.md report 19 passing tests in a network-enabled runtime, successful strict TypeScript checking and ten successful live calls. Those records are preserved as historical evidence and are separate from today's packaging checks.
