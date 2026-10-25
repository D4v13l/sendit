# Send It

Outdoor trip planning, a location database, and reusable Adventure Projects data access in one repository.

**For ChatGPT, Codex or Claude:** read [the AI handoff](docs/AI-HANDOFF.md), then [the architecture](docs/ARCHITECTURE.md). Clone the repository to work with source and data; a README link alone does not grant an assistant execution or GitHub write access.

## Project map

| Component | Location | Role |
|---|---|---|
| Good Outside | [apps/good-outside](apps/good-outside) | Main trip planner, weather ranking, map, bookmarks and location directory |
| Location backend | [apps/good-outside/backend](apps/good-outside/backend) | D1 location API, provider ingestion, refresh jobs and MCP tools |
| Location snapshots | [apps/good-outside/data](apps/good-outside/data) | 44,692 source records in provider metadata; full snapshots are in R2 |
| Artifact edition | [apps/good-outside/artifact](apps/good-outside/artifact) | Good Outside built as a Claude Artifact: curated regions, tile-free map, live data via the Claude desktop app |
| Trail Desk | [apps/trail-desk](apps/trail-desk) | Separate Adventure Projects endpoint explorer and route preview |
| API client | [packages/adventure-projects-client](packages/adventure-projects-client) | Dependency-free JS SDK, TypeScript declarations, demo and tests |
| Architecture / handoff | [docs](docs) | Current boundaries, setup, integration roadmap and validation |
| Snapshot service | [apps/snapshot-service](apps/snapshot-service) | Public R2 reads and authenticated checksum-verified uploads |
| Maintenance commands | [scripts](scripts) | Snapshot restoration, planner tests and client synchronization |

## Start locally

Use Node.js 22.13+ and Python 3 (database tests). From the repository root:

```sh
npm run data:download
npm run check:client
npm run demo:offline
```

The dependency-free API demo opens at http://127.0.0.1:4173. `npm run demo` uses live upstream requests. `npm run test:client` runs its tests.

For the main planner, follow [Good Outside setup](docs/GOOD-OUTSIDE-SETUP.md). To deploy under your own Cloudflare account, see [own-account deployment](docs/DEPLOY-OWN-ACCOUNT.md). Each app retains its own package-lock.json and installs independently; the root is a command hub, not an npm workspace with a shared dependency lockfile. Do not run a root install expecting both apps to be installed.

## How the apps fit together

Good Outside is the main planning experience. Its `/locations` page is the browser for its persistent location catalog. Trail Desk is a separate tool for exploring Adventure Projects search and route geometry. The reusable SDK supports Trail Desk today; feeding its records into the planner is future integration work, not an implemented connection. See [architecture and roadmap](docs/ARCHITECTURE.md).

The four R2 location snapshots contain 35,753 OpenBeta, 6,935 OpenSkiData, 1,955 RIDB and 49 curated records. These are source records, not deduplicated physical places. Preserve per-provider attribution and licenses; OpenSkiData-derived data remains ODbL. See [source documentation](apps/good-outside/docs/data-sources.md).

No credentials, deployed database ownership, user bookmarks or account schedules are transferred. Snapshot JSON can recreate the location records; operational refresh history remains in the original hosted database. See [validation](docs/VALIDATION.md) for checks and limitations.

## External snapshot storage

Catalog records are stored in R2, not GitHub. [The versioned manifest](data/snapshots.json) pins their counts, sizes, hashes and source licenses. `npm run data:download` fetches and verifies them. See [storage operations](docs/DATA-STORAGE.md) for one-command import and publishing future releases.
