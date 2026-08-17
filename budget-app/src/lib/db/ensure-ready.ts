// Called at the top of every server-rendered page / layout.
// Runs DDL + seed once, then no-ops (fast SQLite COUNT check).
import { migrateAndSeed } from "./migrate";

const globalReady = global as typeof global & { _dbReady?: boolean };

export function ensureDb() {
  if (!globalReady._dbReady) {
    migrateAndSeed();
    globalReady._dbReady = true;
  }
}
