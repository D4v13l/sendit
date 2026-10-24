# Project context

The requested handoff covers all of Send It: Good Outside trip planning/location catalog plus the Adventure Projects investigation, SDK and Trail Desk explorer. The user asked for a cohesive repository structure and a GitHub README that another ChatGPT/Claude instance can follow.

Good Outside source was recovered from an existing application workspace after the initial SDK-only handoff. Its README and docs record the product behavior and source research. Those records supersede the initial statement that only the explorer existed. The Send It Page itself remains a placeholder and is not the product specification.

Current organization is apps/good-outside, apps/trail-desk, packages/adventure-projects-client, docs and scripts. The reorganization preserves application internals and separate builds. Proposed runtime integration is documented separately in ARCHITECTURE.md; no shared catalog bridge is claimed as implemented.
