# Prompt for ChatGPT / Codex / Claude

You are continuing Send It from the attached source snapshot. Read START-HERE.md and PROJECT-CONTEXT.md, then adventure-projects-client/README.md and its docs. Inspect source before making claims about implemented behavior.

The current implementation is an Adventure Projects endpoint client and Trail Desk explorer. Do not invent a larger approved product scope. Preserve the distinction between observed endpoints, rejected hypotheses and unresolved behavior. National Parks is a Hiking Project alias, not a park-only filter. Offline records are synthetic and must stay visibly labeled. Climbing results must not be rendered as invented trail geometry.

Start by summarizing the architecture and current limitations. Run the offline test suite when the environment supports Node and local loopback servers. Report actual results separately from historical verification. Use the standalone dependency-free demo for initial exploration. Ask the new owner what feature to work on next if none is specified, while completing environment setup and inspection independently.

The website's custom UI is in sites/trail-desk/trail-ui and its Worker adapter is trail-handler.js, called by worker/index.ts. The library is duplicated in sites/trail-desk/adventure-client; keep that copy synchronized when changing the canonical adventure-projects-client/src implementation. The site's copied trail-ui/server.js currently has an invalid ../src/index.js import; it is not the production Worker entry point.

Use the recipient's own hosting/project configuration for any future deployment. This bundle does not transfer credentials, production access, personal account integrations, or a git remote. Preserve upstream error/rate-limit handling, modest request pacing, validation and request cancellation. Do not treat undocumented routes as a supported public API or claim complete data coverage.

If files are inaccessible, ask for the extracted folder or relevant files. Never claim to have run tests or read files without doing so.
