# Catalog storage and bootstrap

Code, migrations, tests and metadata are in GitHub. Compressed provider records are in Cloudflare R2, served by the independent snapshot-service Worker. Searchable operational records remain in each deployment's own D1 database. No database credentials are in Git.

Current snapshot manifest: https://sendit-catalog-data.johnlhenning.chatgpt.site/manifest.json

The repository pins `data/snapshots.json`, with release keys, SHA-256 hashes, sizes, counts and license labels. All four October 23 snapshots contain 44,692 records total. This release is a point-in-time export, not a continuously changing mirror of the hosted D1 database.

## Friend's setup

1. Clone the repo. Use Node 22.13+.
2. Run `npm run data:download`. No account or token is needed to read these public provider snapshots. Files are verified before any provider files are replaced.
3. Provision a separate D1 database and deploy/configure Good Outside as described in GOOD-OUTSIDE-SETUP.md.
4. Run `npm run data:setup` and supply a single JSON object on stdin with `origin` (the NEW app URL) and `token` (its INGEST_SECRET). End stdin. The command downloads/verifies all snapshots, then uses the existing staged importer. Never put credentials into Git, command arguments or a chat prompt.

`data:setup` requires an already migrated, running destination with ingestion enabled; it does not provision a Cloudflare account or database. `data:download` alone works without those. To use another public HTTPS mirror, set SENDIT_SNAPSHOT_BASE_URL; the same pinned hashes still apply. Authenticated mirrors need an explicit transport extension and are not implied to work with the current downloader.

## Publishing another release

Keep providers separate and preserve attribution. Generate new complete normalized snapshots using the existing ingestion jobs. Choose a new immutable release key; do not overwrite an old release with different content. Recalculate manifest counts, compressed byte sizes and SHA-256 hashes, updating the manifest in both GitHub and the snapshot Worker. Add the release to the service's allowlist before upload. The shipped Worker currently serves only the pinned release; preserve older allowlists when adding releases so old commits remain reproducible.

R2-native route: generate short-lived presigned PUT URLs for the four exact keys. `npm run data:upload` reads `{ "uploads": { "curated": "PRESIGNED_URL", "openbeta": "PRESIGNED_URL", "openskidata": "PRESIGNED_URL", "ridb": "PRESIGNED_URL" } }` from stdin. It checks all local files before uploading. URLs are credentials; keep them out of logs and source. This route works with a separately managed R2 bucket.

Hosted service route: PUT each gzip to `/snapshots/<release>/<provider>.json.gz` with `Authorization: Bearer <UPLOAD_SECRET>`. The secret lives only in the snapshot service's runtime environment. The service only accepts allowlisted hashes and sizes. Reads are public; writes require the secret. Snapshot payloads are never included in the Worker build. Verify all downloaded hashes before promoting a release's base URL/manifest in Git.

Existing Good Outside provider schedules update D1; they do NOT automatically produce or publish new R2 releases. Snapshot publication is a separate deliberate operation. Failed imports preserve existing records through the current staged ingest protocol. Do not infer deletions from partial snapshots.

## Licenses

OpenBeta data is CC0 (photos excluded); OpenSkiData-derived records remain ODbL and must retain attribution and downloadable access. RIDB and curated records retain their source-specific terms. See apps/good-outside/docs/data-sources.md. Metadata and all original per-record evidence survive compression/download/import.
