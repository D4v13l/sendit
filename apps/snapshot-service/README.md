# Send It snapshot service

Dependency-free Cloudflare Worker. R2 binding: BUCKET. Runtime secret: UPLOAD_SECRET. Public GET/HEAD reads; authenticated PUT verifies exact allowlisted size and SHA-256 before storing. The allowlist is embedded in worker/index.js, without record data. Deploy using the Sites Worker ESM workflow (`bash scripts/build.sh`, `node scripts/validate-artifact.mjs`), or adapt it to your own Worker deployment. Configure your own project ID and secret; neither is in this copy. See ../../docs/DATA-STORAGE.md.
