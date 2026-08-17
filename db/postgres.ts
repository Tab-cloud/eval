import { Pool, type PoolClient, type QueryResultRow } from "pg";

type QueryExecutor = Pick<PoolClient, "query"> | Pool;

type RunMeta = { changes: number };
export type DatabaseResult<T = Record<string, unknown>> = {
  success: true;
  results: T[];
  meta: RunMeta;
};

declare global {
  var __evalPostgresPool: Pool | undefined;
}

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "DATABASE_URL is required. Configure a PostgreSQL connection string before using authentication, the console, or community features.",
    );
  }
  return value;
}

function sslConfiguration() {
  const mode = process.env.DATABASE_SSL?.toLowerCase();
  if (!mode || mode === "disable" || mode === "false") return undefined;
  const ca = process.env.DATABASE_SSL_CA?.replaceAll("\\n", "\n");
  return {
    rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
    ...(ca ? { ca } : {}),
  };
}

export function postgresPool() {
  globalThis.__evalPostgresPool ??= new Pool({
    connectionString: databaseUrl(),
    max: Number(process.env.DATABASE_POOL_MAX ?? 15),
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 30_000),
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 5_000),
    ssl: sslConfiguration(),
    application_name: "eval-web",
  });
  return globalThis.__evalPostgresPool;
}

export class PreparedStatement {
  readonly sql: string;
  readonly parameters: unknown[];
  private readonly executor?: QueryExecutor;

  constructor(sql: string, parameters: unknown[] = [], executor?: QueryExecutor) {
    this.sql = sql;
    this.parameters = parameters;
    this.executor = executor;
  }

  bind(...parameters: unknown[]) {
    return new PreparedStatement(this.sql, parameters, this.executor);
  }

  async all<T = Record<string, unknown>>(): Promise<DatabaseResult<T>> {
    const result = await this.execute(this.executor ?? postgresPool());
    return { success: true, results: result.rows as T[], meta: { changes: result.rowCount ?? 0 } };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.execute(this.executor ?? postgresPool());
    return (result.rows[0] as T | undefined) ?? null;
  }

  async run(): Promise<DatabaseResult> {
    const result = await this.execute(this.executor ?? postgresPool());
    return { success: true, results: result.rows, meta: { changes: result.rowCount ?? 0 } };
  }

  async execute(executor: Pick<PoolClient, "query"> | Pool) {
    const result = await executor.query(translatePlaceholders(this.sql), this.parameters);
    return { ...result, rows: restoreAliases(result.rows, this.sql) };
  }
}

export class PostgresDatabase {
  prepare(sql: string) {
    return new PreparedStatement(sql);
  }

  async batch(statements: PreparedStatement[]) {
    const pool = postgresPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const results: DatabaseResult[] = [];
      for (const statement of statements) {
        const result = await statement.execute(client);
        results.push({ success: true, results: result.rows, meta: { changes: result.rowCount ?? 0 } });
      }
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async transaction<T>(work: (transaction: Pick<PostgresDatabase, "prepare">) => Promise<T>): Promise<T> {
    const client = await postgresPool().connect();
    try {
      await client.query("BEGIN");
      const transaction = {
        prepare(sql: string) {
          return new PreparedStatement(sql, [], client);
        },
      };
      const result = await work(transaction);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

const sharedDatabase = new PostgresDatabase();

export function postgresDatabase() {
  return sharedDatabase;
}

function translatePlaceholders(sql: string) {
  let parameter = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  let output = "";
  for (let index = 0; index < sql.length; index++) {
    const character = sql[index];
    const previous = sql[index - 1];
    if (character === "'" && !doubleQuoted && previous !== "\\") singleQuoted = !singleQuoted;
    if (character === "\"" && !singleQuoted && previous !== "\\") doubleQuoted = !doubleQuoted;
    if (character === "?" && !singleQuoted && !doubleQuoted) {
      parameter += 1;
      output += `$${parameter}`;
    } else {
      output += character;
    }
  }
  return output;
}

function restoreAliases<T extends QueryResultRow>(rows: T[], sql: string): T[] {
  const aliases = new Map<string, string>();
  for (const match of sql.matchAll(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*)/gi)) {
    const alias = match[1];
    if (/[A-Z]/.test(alias)) aliases.set(alias.toLowerCase(), alias);
  }
  if (!aliases.size) return rows;
  return rows.map((row) => {
    const next: Record<string, unknown> = { ...row };
    for (const [postgresName, requestedName] of aliases) {
      if (postgresName in next) {
        next[requestedName] = next[postgresName];
        delete next[postgresName];
      }
    }
    return next as T;
  });
}
