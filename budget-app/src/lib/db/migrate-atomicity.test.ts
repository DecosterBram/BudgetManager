import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { runMigration } from "./migrate";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-migrate-atomic-"));
const dbPath = path.join(tmpDir, "legacy.db");

/** A single legacy category — just enough to run a real rebuild against. */
function buildLegacyDb(file: string) {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      kind        TEXT NOT NULL CHECK (kind IN ('need','want','save')),
      block       TEXT NOT NULL CHECK (block IN ('living','subscriptions','regular','misc')),
      sort_order  INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT
    );
    INSERT INTO categories (id, name, kind, block, sort_order, archived_at) VALUES
      (1, 'Rent', 'need', 'living', 1, NULL);
  `);
  sqlite.close();
}

buildLegacyDb(dbPath);

describe("runMigration — version stamp is atomic with the schema change", () => {
  it("leaves user_version and the old schema untouched when the migration throws before commit", () => {
    const sqlite = new Database(dbPath);
    sqlite.pragma("foreign_keys = ON");

    // Does the real copy-drop-rename rebuild, then blows up before runMigration
    // can COMMIT — proves the whole rebuild (DROP/RENAME included) rolls back,
    // not just a trailing INSERT.
    const failingMigration = {
      version: 1,
      up: (db: InstanceType<typeof Database>) => {
        db.exec(`
          CREATE TABLE category_groups (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            archived_at TEXT
          );
          INSERT INTO category_groups (name, sort_order) VALUES ('Living expenses', 1);
          CREATE TABLE categories_new (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE,
            kind        TEXT NOT NULL,
            group_id    INTEGER NOT NULL REFERENCES category_groups(id),
            sort_order  INTEGER NOT NULL DEFAULT 0,
            archived_at TEXT
          );
          INSERT INTO categories_new (id, name, kind, group_id, sort_order, archived_at)
          SELECT id, name, kind, 1, sort_order, archived_at FROM categories;
          DROP TABLE categories;
          ALTER TABLE categories_new RENAME TO categories;
        `);
        throw new Error("simulated crash after rebuild, before commit");
      },
    };

    expect(() => runMigration(sqlite, failingMigration)).toThrow("simulated crash");

    expect(sqlite.pragma("user_version", { simple: true })).toBe(0);
    const cols = (sqlite.prepare("PRAGMA table_info(categories)").all() as { name: string }[]).map(
      (c) => c.name
    );
    expect(cols).toContain("block");
    expect(cols).not.toContain("group_id");
    expect(
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'category_groups'").get()
    ).toBeUndefined();

    sqlite.close();
  });
});
