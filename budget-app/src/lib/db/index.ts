import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import * as schema from "./schema";

// BUDGET_DB_PATH lets tests point at a throwaway file instead of the real database.
const DB_PATH = process.env.BUDGET_DB_PATH ?? path.join(process.cwd(), "data", "budget.db");

// Singleton — reuse across hot-reloads in dev
const globalForDb = global as typeof global & { _db?: ReturnType<typeof drizzle> };

function createDb() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export const db = globalForDb._db ?? (globalForDb._db = createDb());
export type Db = typeof db;
