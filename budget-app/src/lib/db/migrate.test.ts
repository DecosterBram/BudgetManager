import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-migrate-"));
const dbPath = path.join(tmpDir, "legacy.db");
process.env.BUDGET_DB_PATH = dbPath;

/** The schema exactly as it shipped before category groups existed. */
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
    CREATE TABLE months (
      month TEXT PRIMARY KEY,
      income_projected_cents INTEGER NOT NULL DEFAULT 0,
      income_actual_cents    INTEGER NOT NULL DEFAULT 0,
      pct_need REAL NOT NULL DEFAULT 0.50,
      pct_want REAL NOT NULL DEFAULT 0.25,
      pct_save REAL NOT NULL DEFAULT 0.25,
      closed_at TEXT
    );
    CREATE TABLE transactions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_on    TEXT NOT NULL,
      date_precision TEXT NOT NULL DEFAULT 'day' CHECK (date_precision IN ('day','month')),
      description    TEXT NOT NULL,
      amount_cents   INTEGER NOT NULL,
      category_id    INTEGER NOT NULL REFERENCES categories(id),
      kind           TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense','income')),
      note           TEXT,
      entry_source   TEXT NOT NULL DEFAULT 'manual' CHECK (entry_source IN ('manual','import')),
      created_at     TEXT NOT NULL
    );
    CREATE TABLE budget_lines (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      month         TEXT NOT NULL,
      category_id   INTEGER NOT NULL REFERENCES categories(id),
      planned_cents INTEGER NOT NULL,
      UNIQUE (month, category_id)
    );
    CREATE TABLE merchant_rules (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern      TEXT NOT NULL UNIQUE,
      category_id  INTEGER NOT NULL REFERENCES categories(id),
      hit_count    INTEGER NOT NULL DEFAULT 1,
      last_used_on TEXT NOT NULL
    );

    INSERT INTO categories (id, name, kind, block, sort_order, archived_at) VALUES
      (1, 'Rent',      'need', 'living',        1, NULL),
      (2, 'Spotify',   'want', 'subscriptions', 1, NULL),
      (3, 'Groceries', 'need', 'regular',       1, NULL),
      (4, 'Gifts',     'want', 'misc',          1, NULL),
      (5, 'Old thing', 'want', 'regular',       9, '2026-07-01');
    INSERT INTO months (month, income_projected_cents, income_actual_cents) VALUES ('2026-08', 280000, 280000);
    INSERT INTO months (month, income_projected_cents, income_actual_cents) VALUES ('2026-07', 283500, 283500);
    INSERT INTO budget_lines (month, category_id, planned_cents) VALUES ('2026-08', 1, 75000);
    INSERT INTO transactions (occurred_on, description, amount_cents, category_id, created_at)
      VALUES ('2026-08-01', 'Rent August', 75000, 1, '2026-08-01T00:00:00.000Z');
    INSERT INTO merchant_rules (pattern, category_id, hit_count, last_used_on)
      VALUES ('aldi', 3, 4, '2026-08-01');
  `);
  sqlite.close();
}

buildLegacyDb(dbPath);

const { migrateAndSeed } = await import("./migrate");
migrateAndSeed();

const read = new Database(dbPath, { readonly: true });

describe("migration 001 — blocks become category groups", () => {
  it("keeps every category with its name, kind, sort order and archived state", () => {
    const rows = read
      .prepare("SELECT id, name, kind, sort_order, archived_at FROM categories ORDER BY id")
      .all();
    expect(rows).toEqual([
      { id: 1, name: "Rent",      kind: "need", sort_order: 1, archived_at: null },
      { id: 2, name: "Spotify",   kind: "want", sort_order: 1, archived_at: null },
      { id: 3, name: "Groceries", kind: "need", sort_order: 1, archived_at: null },
      { id: 4, name: "Gifts",     kind: "want", sort_order: 1, archived_at: null },
      { id: 5, name: "Old thing", kind: "want", sort_order: 9, archived_at: "2026-07-01" },
    ]);
  });

  it("maps each old block onto the matching group", () => {
    const rows = read
      .prepare(`SELECT c.name, g.name AS group_name
                FROM categories c JOIN category_groups g ON g.id = c.group_id
                ORDER BY c.id`)
      .all();
    expect(rows).toEqual([
      { name: "Rent",      group_name: "Living expenses" },
      { name: "Spotify",   group_name: "Subscriptions" },
      { name: "Groceries", group_name: "Regular expenses" },
      { name: "Gifts",     group_name: "Miscellaneous" },
      { name: "Old thing", group_name: "Regular expenses" },
    ]);
  });

  it("seeds the four groups in display order", () => {
    const names = (
      read.prepare("SELECT name FROM category_groups ORDER BY sort_order").all() as { name: string }[]
    ).map((r) => r.name);
    expect(names).toEqual(["Living expenses", "Subscriptions", "Regular expenses", "Miscellaneous"]);
  });

  it("leaves child rows pointing at their categories", () => {
    expect(read.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(read.prepare("SELECT COUNT(*) n FROM budget_lines WHERE category_id = 1").get()).toEqual({ n: 1 });
    expect(read.prepare("SELECT COUNT(*) n FROM transactions WHERE category_id = 1").get()).toEqual({ n: 1 });
    expect(read.prepare("SELECT COUNT(*) n FROM merchant_rules WHERE category_id = 3").get()).toEqual({ n: 1 });
  });

  it("stamps the schema version and is a no-op on a second run", () => {
    expect(read.pragma("user_version", { simple: true })).toBe(1);
    migrateAndSeed();
    expect(read.prepare("SELECT COUNT(*) n FROM category_groups").get()).toEqual({ n: 4 });
    expect(read.prepare("SELECT COUNT(*) n FROM categories").get()).toEqual({ n: 5 });
  });
});
