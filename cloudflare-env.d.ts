declare namespace Cloudflare {
  interface Env {
    AUTH_MODE?: "firebase" | "sites";
    RESEARCH_OWNER_EMAIL?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
