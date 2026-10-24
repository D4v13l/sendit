# Good Outside setup

Requires Node 22.13+ and Python 3 for database tests. From repo root:

```sh
npm run data:download
cd apps/good-outside
npm run install:ci
npm run build
```

The hosting manifest declares a D1 binding named `DB`; its original project ID is removed. Create your own Sites/Cloudflare project and D1 database; for a direct Cloudflare deployment see [DEPLOY-OWN-ACCOUNT.md](DEPLOY-OWN-ACCOUNT.md). Retain the DB binding. The original owner’s account, tokens and schedules are not part of this repository.

For local D1 after building:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_deep_darwin.sql
npm start -- --port 8767
```

Apply this initial migration to a fresh database only. Check drizzle/ for future migrations. Configure a new `INGEST_SECRET` using your platform's local/server secret mechanism, and optionally `INGEST_OWNER_EMAIL` for owner-controlled refresh. Never commit values. See cloudflare-env.d.ts and backend authorization code for binding details.

Download snapshots before import. `node backend/ingestion/publish.mjs all` reads JSON credentials `{ "origin": "YOUR_NEW_ORIGIN", "token": "YOUR_NEW_SECRET" }` from standard input, not arguments. Supply these securely in your own environment. It stages and finalizes each complete provider snapshot, sends bounded batches and reads back health. Check `/api/health` for 44,692 total source records after import. Do not send imports to the original public deployment.

From repo root, `npm run test:planner` runs the main weather/UI-domain tests plus database, jobs, ingestion and directory checks after dependencies are installed. `npm run build:planner` builds the application. Third-party weather, routing and maps need network access.

The four downloadable R2 snapshots retain 49 curated, 35,753 OpenBeta, 6,935 OpenSkiData and 1,955 RIDB records. Both compressed and uncompressed records are downloaded locally and gitignored. This is a portable catalog snapshot, not an exported D1 operational database. Preserve provider licenses and attribution in any UI/export.

The original app README records three schedules (Eastern: OpenSkiData daily 04:00; OpenBeta Sunday 04:30; RIDB Sunday 05:00). Those are historical setup, not installed by this repo. Recreate schedules in the new hosting account using backend refresh/MCP endpoints if desired; preserve daily/weekly guards and OpenBeta continuation handling. No schedule or production refresh was triggered during handoff.
