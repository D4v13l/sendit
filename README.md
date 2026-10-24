# Send It
Snapshot: October 23, 2026 (America/New_York).

## Start here — ChatGPT, Codex or Claude
Clone or download this repository into a workspace accessible to ChatGPT/Codex or Claude Code. Read [AI-HANDOFF.md](AI-HANDOFF.md) and follow its instructions. For a chat-only interface, attach AI-HANDOFF.md and the relevant source files if it cannot open ZIP archives. No access to the original ChatGPT account is needed for the standalone client/demo.

## Included
- `adventure-projects-client/`: complete dependency-free JS SDK, TypeScript declarations, local browser demo, synthetic offline fixtures, CLI examples, tests, research README and design/verification notes.
- `sites/trail-desk/`: website source, Worker adapter, UI, vendored client, dependency lockfile, framework configuration and supporting assets/scripts.
- [PROJECT-CONTEXT.md](PROJECT-CONTEXT.md): established requests, architecture, unresolved questions and suggested next steps.
- [VALIDATION.md](VALIDATION.md): current checks and limitations.
- `MANIFEST.json`: SHA-256 hashes and sizes for every included file except the manifest itself.

## Quick start (recommended)
Install Node.js 20+ (22.13+ also satisfies the website requirement), then:

```sh
cd adventure-projects-client
npm test
npm run demo:offline
```
Open http://127.0.0.1:4173. Stop with Ctrl+C. For real upstream data use `npm run demo`. No npm install is needed for this package.

## Website
The website uses Vinext/Vite and a Cloudflare Worker. See its README for the framework lifecycle.

```sh
cd sites/trail-desk
npm run install:ci
npm run build
npm start
```
Use the URL printed by the server. These commands require downloading dependencies and have not been rerun for this handoff. The Worker intercepts `/`, `/app.js`, `/style.css`, `/api/config`, `/api/search`, and `/api/route`; the placeholder `app/page.tsx` is not the main Trail Desk UI. `npm run dev` may differ from the built Worker path, so use the built preview to verify the actual handler.

Do not run `sites/trail-desk/trail-ui/start.js`: that copied demo server imports a missing `../src/index.js`. Use the standalone demo above, or repair that import deliberately in future work.

## Portability and scope
This is a source snapshot, not a transfer of a hosted account or deployment. The original Sites project ID was removed from the copied hosting manifest so a future deployment can be associated with a new project. Original local files were not changed. Dependencies, build output, git internals, runtime caches, environment files and the redundant deployment tarball are excluded. Vendored source and its license files are included.

The accessible Send It Page contains only an introduction placeholder and has no child pages. No broader product specification was found. The context document summarizes available project conversation, not a complete transcript export. No unrelated personal history is included. Existing source licensing and upstream-data limitations are unchanged.
