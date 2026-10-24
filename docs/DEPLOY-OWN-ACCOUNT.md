# Deploying to your own Cloudflare account

The apps were originally published through ChatGPT Sites. Their builds are standard Cloudflare Workers (Vinext/workerd), so they also deploy directly with Wrangler. This guide uses only your own account, Worker names and D1 database. Never reuse the original owner's project IDs, deployment URLs, tokens or schedules.

## What the build needs from you

`vite.config.ts` in each app accepts optional overrides. Unset, builds keep the Sites placeholders and are unchanged.

| Variable | App | Purpose |
|---|---|---|
| `SENDIT_WORKER_NAME` | both | Worker name. Set it: both apps otherwise default to the same template name and would overwrite each other. |
| `SENDIT_D1_NAME` | good-outside | Your D1 database name. |
| `SENDIT_D1_ID` | good-outside | Your D1 database ID (an identifier, not a secret). Also enables `wrangler d1 migrations apply` against `drizzle/`. |

## Good Outside

From `apps/good-outside`, after `npm run install:ci`:

```sh
W="node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js"
$W login                                   # browser OAuth; or CLOUDFLARE_API_TOKEN in CI secrets
$W d1 create good-outside                  # note the database_id it prints
SENDIT_WORKER_NAME=good-outside SENDIT_D1_NAME=good-outside SENDIT_D1_ID=<database_id> npm run build
$W d1 migrations apply DB --remote --config dist/server/wrangler.json
$W deploy --config dist/server/wrangler.json
openssl rand -hex 32                       # store in your password manager, not in Git or chat
$W secret put INGEST_SECRET --config dist/server/wrangler.json   # paste at the hidden prompt
```

Then import the snapshots from the repository root. Credentials go on stdin only:

```sh
npm run data:setup     # paste {"origin":"https://good-outside.<subdomain>.workers.dev","token":"<INGEST_SECRET>"}, then Ctrl-D
```

`/api/health` should then report 44,692 total records.

**Do not set `INGEST_OWNER_EMAIL` on a direct Cloudflare deployment.** Owner checks trust the `oai-authenticated-user-email` request header, which only the Sites platform strips and sets. On a plain Worker any client can send that header. With the variable unset, `/api/ingest`, `/api/jobs/refresh` and the MCP refresh tool require the `INGEST_SECRET` bearer. The read-only MCP health tool can still be reached with a forged header; it exposes the same data as the public `/api/health`.

Access: on Sites, the original was behind a signed-in access policy. A plain Worker is public. If you want it private, put Cloudflare Access in front of the route.

Refresh schedules: the Worker has no `scheduled()` handler, so Cloudflare Cron Triggers cannot drive refreshes yet. Options: an external scheduler (for example GitHub Actions with the bearer stored as an Actions secret) calling `POST /api/jobs/refresh`, or a small `scheduled()` handler added to `worker/index.ts`. Keep the existing daily/weekly cadence guards either way.

## Trail Desk

From `apps/trail-desk`, after `npm run install:ci`:

```sh
SENDIT_WORKER_NAME=trail-desk npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js deploy --config dist/server/wrangler.json
```

It needs no database or secrets. It proxies requests to unofficial Adventure Projects website endpoints with no data license grant (see the SDK README). Consider keeping it private (Cloudflare Access) instead of offering a public proxy.

## Snapshot storage

`npm run data:download` reads the public, checksum-pinned release in `data/snapshots.json`. No account is needed, and a separate snapshot service is optional. To publish your own future releases, create your own R2 bucket and follow DATA-STORAGE.md (presigned-URL route), or deploy apps/snapshot-service with your own `BUCKET` binding and `UPLOAD_SECRET`.

## Local run

After building, migrate local D1 with the command in GOOD-OUTSIDE-SETUP.md. Put a generated `INGEST_SECRET=...` line in `apps/good-outside/.dev.vars` (gitignored, mode 600). Wrangler reads it from next to the generated config, so link it again after each build:

```sh
ln -sf ../../.dev.vars dist/server/.dev.vars && npm start -- --port 8767
```

Import into the local Worker from the repository root without typing the secret:

```sh
node -e 'const s=require("fs").readFileSync("apps/good-outside/.dev.vars","utf8").match(/^INGEST_SECRET=(.+)$/m)[1];process.stdout.write(JSON.stringify({origin:"http://127.0.0.1:8767",token:s}))' | npm run data:setup
```

Behind an HTTPS proxy, Node's `fetch` ignores `HTTPS_PROXY` unless you prefix the download/setup commands with `NODE_USE_ENV_PROXY=1` (Node 22.21+).
