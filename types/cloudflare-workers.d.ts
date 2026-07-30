/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    RELEASES: R2Bucket;
    [key: string]: unknown;
  }
}
