declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    INGEST_SECRET?: string;
    INGEST_OWNER_EMAIL?: string;
    BUCKET?: R2Bucket;
  }
}
