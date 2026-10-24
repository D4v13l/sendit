# Project context and continuation notes

## Confirmed requests
The user asked to investigate usable data endpoints for Hiking Project after the public API became inaccessible; extend the investigation to Powder Project, Mountain Project, MTB Project, Trail Run Project and National Parks; form and test educated route hypotheses; document findings in a README; build a reusable client library and a demo. The current request is to make the work portable for a friend to continue in another ChatGPT or Claude instance.

## Implementation
The canonical SDK is ES-module JavaScript with TypeScript declarations, no runtime dependencies and an injectable fetch transport. It wraps structured search, route detail, supported elevation profiles, Mountain Project areas/photos, and selected HTML endpoints. The Node demo exposes a fixed local server API; the browser calls that server and renders route metadata/geometry without a basemap. The website copies the client and UI and adapts their requests to a Cloudflare Worker.

Read the SDK README for endpoint and capability tables, exact examples and rejected hypotheses; those are the detailed research record. Read docs/design.md for design choices and docs/verification.md for historical evidence.

## Known limitations
- Undocumented website contracts can change. Prior checks are dated October 23, 2026, not a guarantee of current availability.
- National Parks is an alias to Hiking Project. Search text does not establish park membership.
- Geographic/bounding-box filters, complete park membership, bulk enumeration, upstream limits, geometry fidelity and full schemas remain unresolved.
- A 200 response does not prove that parameters were honored. A 401 does not prove that a useful protected resource exists.
- The SDK has no arbitrary filter option and does not expose guessed unsupported routes.
- Browser CORS, all sorting/domain combinations, all schema variants and mobile UI behavior were not exhaustively validated.
- Demo geometry is not an outdoor navigation map. HTML responses remain inert text.
- The SDK is marked UNLICENSED pending an explicit distribution decision; upstream data rights are not granted by this source bundle.
- The website README primarily describes its framework starter. The custom application is reached through the Worker handler.
- The accessible Send It Space currently has only a placeholder introduction. No additional approved roadmap or full product specification was recovered.

## Suggested next work (not previously approved requirements)
1. Run the standalone offline demo and tests on the recipient's computer.
2. Decide the next desired product capability with the new owner.
3. Remove duplicated client/UI drift through a shared package or explicit synchronization workflow.
4. Repair or remove the unused copied Node demo scripts in the website folder.
5. Verify the built website locally, then configure a new deployment under the recipient's account if requested.
6. Investigate unresolved endpoint behavior with small read-only requests and record evidence, including rejected hypotheses.

No hosted deployment status or current public URL was independently verified for this handoff. No GitHub remote was identified in the inspected source folders.
