# Implementation choices

The user requested endpoint documentation, a reusable client, and a demo consuming the library. The existing investigation supplies the behavior to implement.

- Runtime: dependency-free ES modules on Node 20+, with TypeScript declarations. Plain JavaScript avoids a build/install requirement for the demo.
- Client: fixed host mapping, injected Fetch, read-only endpoint methods, lightweight response validation, cancellable timeouts, per-instance request pacing, and explicit capability errors. Preserve upstream differences rather than invent a universal route object.
- Search: POST types and sort, GET query/pagination parameters; bounded opt-in iteration. Do not expose silently ignored geographic filters.
- Demo: local Node HTTP server invokes the same client. Three synthetic records are available via explicit offline mode. Browser renders only text and locally generated SVG; no upstream HTML or scripts execute.
- Visual plan: slate #203347 for navigation, blue #17678a for trail lines/actions, pale blue #edf2f5 for working surface, white #ffffff for records, gold #d7a74f for the start marker. Georgia route headings and neutral Arial controls. A searchable list sits beside a geometry preview; responsive layout stacks them on narrow screens. The trail line is the main visual element; no external imagery or map-token dependency.
- Non-goals: complete catalog crawling, account data, private endpoints, guessing around 401/403 responses, original GPX export, production deployment, package publication, or geographic filtering claimed as verified.
- Verification: deterministic tests at request/response boundaries, a local demo integration test, browser inspection, and small opt-in live smoke checks.

No upstream prose or imagery is bundled as a demo dataset. Test records are synthetic; live responses are fetched only when requested.
