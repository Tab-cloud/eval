import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { postgresPool } from "./postgres";

export function getDb() {
  return drizzle(postgresPool(), { schema });
}
