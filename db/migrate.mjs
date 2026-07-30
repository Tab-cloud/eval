import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required to apply PostgreSQL migrations.");

const sslMode = process.env.DATABASE_SSL?.toLowerCase();
const ssl = !sslMode || sslMode === "disable" || sslMode === "false"
  ? undefined
  : {
      rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
      ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA.replaceAll("\\n", "\n") } : {}),
    };

const pool = new pg.Pool({ connectionString: databaseUrl, ssl, application_name: "eval-web-migrate" });
const migrationsDirectory = path.resolve(process.cwd(), "drizzle");
const files = (await readdir(migrationsDirectory))
  .filter((file) => /^\d+_.+\.sql$/.test(file))
  .sort((left, right) => left.localeCompare(right));

const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(hashtext('eval-web-schema-migrations'))");
  await client.query(`
    CREATE TABLE IF NOT EXISTS eval_schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  for (const file of files) {
    const existing = await client.query("SELECT 1 FROM eval_schema_migrations WHERE name = $1", [file]);
    if (existing.rowCount) continue;
    const source = await readFile(path.join(migrationsDirectory, file), "utf8");
    const statements = source
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    await client.query("BEGIN");
    try {
      for (const statement of statements) await client.query(statement);
      await client.query("INSERT INTO eval_schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('eval-web-schema-migrations'))").catch(() => undefined);
  client.release();
  await pool.end();
}
