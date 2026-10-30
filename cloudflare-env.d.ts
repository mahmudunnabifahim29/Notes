declare namespace Cloudflare {
  interface Env {
    AUTH_MODE?: "firebase" | "sites";
    RESEARCH_OWNER_EMAIL?: string;
    FILE_STORAGE?: "d1" | "r2";
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
