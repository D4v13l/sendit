# Verification record

Verified during implementation on October 23, 2026 (US Eastern).

## Automated checks

- 19 tests passed; 0 failed, cancelled, or skipped. Includes request construction, default route-only search, pagination offsets and page caps, malformed JSON/geometry, API failures and Retry-After hints, cancellation/timeouts, unsupported capability guards, climbing area/photo resources, and a real local HTTP demo integration test.
- The shell sandbox permitted unit tests but denied loopback listeners with EPERM. The complete suite, including the HTTP integration test, subsequently passed using the network-enabled Node runtime. This is an environment constraint, not a skipped test.
- TypeScript 5.9.3 checked `test/types.ts` with strict mode, ES2022, NodeNext modules, and DOM types. Exit status 0. Checks cover default hiking return types, literal climbing types, a site union, and rejection of unsupported options.
- Browser JavaScript syntax checks passed. The runtime package has no dependencies.

## Live checks through the shipped client

Each site was searched with `limit: 1`, followed by one explicit route retrieval. All ten calls succeeded and passed the client's response validation. No credentials were supplied.

| Site | Search query | Route ID | Returned title |
|---|---|---|---|
| Hiking | Gorham | 7019235 | Gorham Mountain Loop |
| MTB | Saguaro | 7034858 | Saguaro Trail |
| Powder | Steg | 7000630 | The Steg (osaurus) |
| Trail Run | Dead Horse | 7018118 | Dead Horse Ultra 30k |
| Mountain | Serenity | 105862912 | Serenity Crack |

Supporting endpoints (elevation, photos, area records, conditions) were verified during the preceding discovery and have deterministic client tests where applicable; they were not all live-rechecked during packaging. Findings in README distinguish verified results from unverified or rejected hypotheses.

## Browser checks

At the default desktop viewport, the offline demo loaded its three labeled synthetic records. Selecting Granite Lake Circuit rendered the SVG line, start marker, distance, ascent, and rating. Switching to Mountain Project and selecting a result displayed grade, pitches, height, and the parent-area location notice. Searching for `zzzz` displayed the empty-results message.

The responsive CSS includes a single-column mobile layout, but mobile visual inspection was not performed. The JSON download button, direct browser-to-upstream CORS, every possible sort on every domain, and all schema variants were not exhaustively tested. This record should not be read as those claims.

## Reproduction

`npm test` runs the offline suite. `npm run test:live` performs ten read-only network requests and exits nonzero if any fails. To reproduce declaration checking with a separately installed compiler:

```bash
tsc --noEmit --strict --target es2022 --module nodenext --lib es2022,dom test/types.ts
```
