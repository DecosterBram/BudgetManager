// Runs DDL and seeds initial data.
// Called once on first startup via src/lib/db/ensure-ready.ts.
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.BUDGET_DB_PATH ?? path.join(process.cwd(), "data", "budget.db");

type Sqlite = InstanceType<typeof Database>;

/** Rebuilds `categories` with a group_id FK. SQLite cannot drop a CHECK constraint,
 *  so the table is recreated by the standard copy-drop-rename procedure. */
function migration001CategoryGroups(sqlite: Sqlite) {
  const countCategories = () =>
    (sqlite.prepare("SELECT COUNT(*) AS n FROM categories").get() as { n: number }).n;

  // foreign_keys cannot be toggled inside a transaction, so it goes around it.
  sqlite.pragma("foreign_keys = OFF");
  try {
    const before = countCategories();
    sqlite.exec("BEGIN");
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS category_groups (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL UNIQUE,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT
      );

      INSERT OR IGNORE INTO category_groups (name, sort_order) VALUES
        ('Living expenses', 1), ('Subscriptions', 2), ('Regular expenses', 3), ('Miscellaneous', 4);

      CREATE TABLE categories_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL UNIQUE,
        kind        TEXT NOT NULL CHECK (kind IN ('need','want','save')),
        group_id    INTEGER NOT NULL REFERENCES category_groups(id),
        sort_order  INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT
      );

      INSERT INTO categories_new (id, name, kind, group_id, sort_order, archived_at)
      SELECT c.id, c.name, c.kind, g.id, c.sort_order, c.archived_at
      FROM categories c
      JOIN category_groups g ON g.name = CASE c.block
        WHEN 'living'        THEN 'Living expenses'
        WHEN 'subscriptions' THEN 'Subscriptions'
        WHEN 'regular'       THEN 'Regular expenses'
        ELSE                      'Miscellaneous'
      END;

      DROP TABLE categories;
      ALTER TABLE categories_new RENAME TO categories;

      CREATE INDEX IF NOT EXISTS ix_cat_group ON categories(group_id);
    `);

    const after = countCategories();
    if (after !== before) throw new Error(`migration 001: category count changed ${before} → ${after}`);
    const orphans = sqlite.prepare("PRAGMA foreign_key_check").all();
    if (orphans.length) throw new Error(`migration 001: ${orphans.length} orphaned rows after rebuild`);

    sqlite.exec("COMMIT");
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }
}

const MIGRATIONS: { version: number; up: (sqlite: Sqlite) => void }[] = [
  { version: 1, up: migration001CategoryGroups },
];
const LATEST_VERSION = MIGRATIONS.length;

function applyMigrations(sqlite: Sqlite) {
  const current = sqlite.pragma("user_version", { simple: true }) as number;
  for (const migration of MIGRATIONS) {
    if (migration.version > current) {
      migration.up(sqlite);
      sqlite.pragma(`user_version = ${migration.version}`);
    }
  }
}

export function migrateAndSeed() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const isNewDatabase = !sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'categories'")
    .get();

  if (!isNewDatabase) applyMigrations(sqlite);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS category_groups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      kind        TEXT NOT NULL CHECK (kind IN ('need','want','save')),
      group_id    INTEGER NOT NULL REFERENCES category_groups(id),
      sort_order  INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_cat_group ON categories(group_id);

    CREATE TABLE IF NOT EXISTS months (
      month                   TEXT PRIMARY KEY,
      income_projected_cents  INTEGER NOT NULL DEFAULT 0,
      income_actual_cents     INTEGER NOT NULL DEFAULT 0,
      pct_need                REAL NOT NULL DEFAULT 0.50,
      pct_want                REAL NOT NULL DEFAULT 0.25,
      pct_save                REAL NOT NULL DEFAULT 0.25,
      closed_at               TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
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
    CREATE INDEX IF NOT EXISTS ix_tx_month ON transactions(substr(occurred_on,1,7));
    CREATE INDEX IF NOT EXISTS ix_tx_category ON transactions(category_id);

    CREATE TABLE IF NOT EXISTS budget_lines (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      month         TEXT NOT NULL,
      category_id   INTEGER NOT NULL REFERENCES categories(id),
      planned_cents INTEGER NOT NULL,
      UNIQUE (month, category_id)
    );

    CREATE TABLE IF NOT EXISTS merchant_rules (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern      TEXT NOT NULL UNIQUE,
      category_id  INTEGER NOT NULL REFERENCES categories(id),
      hit_count    INTEGER NOT NULL DEFAULT 1,
      last_used_on TEXT NOT NULL
    );
  `);

  if (isNewDatabase) sqlite.pragma(`user_version = ${LATEST_VERSION}`);

  const insertGroup = sqlite.prepare(
    "INSERT OR IGNORE INTO category_groups (name, sort_order) VALUES (?, ?)"
  );
  const insertCat = sqlite.prepare(
    "INSERT INTO categories (name, kind, group_id, sort_order) VALUES (?, ?, ?, ?)"
  );
  const insertMonth = sqlite.prepare(
    `INSERT OR IGNORE INTO months (month, income_projected_cents, income_actual_cents, pct_need, pct_want, pct_save)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertLine = sqlite.prepare(
    "INSERT OR IGNORE INTO budget_lines (month, category_id, planned_cents) VALUES (?, ?, ?)"
  );
  const insertTx = sqlite.prepare(
    `INSERT INTO transactions (occurred_on, date_precision, description, amount_cents, category_id, kind, entry_source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertRule = sqlite.prepare(
    "INSERT OR IGNORE INTO merchant_rules (pattern, category_id, hit_count, last_used_on) VALUES (?, ?, ?, ?)"
  );

  // Seed base data only if categories table is empty
  const count = (sqlite.prepare("SELECT COUNT(*) as n FROM categories").get() as { n: number }).n;

  const seedAll = sqlite.transaction(() => {
    const groupNames = ["Living expenses", "Subscriptions", "Regular expenses", "Miscellaneous"];
    groupNames.forEach((name, i) => insertGroup.run(name, i + 1));
    const groupId = Object.fromEntries(
      (sqlite.prepare("SELECT id, name FROM category_groups").all() as { id: number; name: string }[])
        .map((g) => [g.name, g.id])
    ) as Record<string, number>;
    const GROUP_OF = {
      living: groupId["Living expenses"],
      subscriptions: groupId["Subscriptions"],
      regular: groupId["Regular expenses"],
      misc: groupId["Miscellaneous"],
    } as const;

    // Categories
    const cats = [
      ["Rent",                "need", "living",        1],
      ["Electricity + Heating","need","living",        2],
      ["Water",               "need", "living",        3],
      ["Internet",            "need", "living",        4],
      ["Insurance",           "need", "living",        5],
      ["Afval",               "need", "living",        6],
      ["Spotify",             "want", "subscriptions", 1],
      ["iCloud",              "want", "subscriptions", 2],
      ["Claude",              "want", "subscriptions", 3],
      ["Groceries",           "need", "regular",       1],
      ["Food",                "want", "regular",       2],
      ["Fun",                 "want", "regular",       3],
      ["Clothes",             "want", "regular",       4],
      ["Hairdresser",         "want", "regular",       5],
      ["Parking",             "need", "regular",       6],
      ["Gym",                 "want", "regular",       7],
      ["Gifts",               "want", "misc",          1],
      ["Pension Savings",     "save", "misc",          2],
      ["Other",               "need", "misc",          3],
    ] as const;
    for (const [name, kind, block, order] of cats) {
      insertCat.run(name, kind, GROUP_OF[block], order);
    }

    // Month
    insertMonth.run("2026-08", 280000, 283500, 0.50, 0.25, 0.25);

    // Budget lines (category IDs follow insertion order: 1-19)
    const lines: [number, number][] = [
      [1, 75000], [2, 12000], [3, 2500],  [4, 5000],  [5, 8000],  [6, 1500],
      [7, 1099],  [8, 299],   [9, 10000],
      [10,30000], [11,15000], [12,10000], [13,5000],  [14,3500],  [15,2000], [16,4000],
      [17,5000],  [18,50000], [19,2000],
    ];
    for (const [catId, planned] of lines) {
      insertLine.run("2026-08", catId, planned);
    }

    // Transactions
    const now = new Date().toISOString();
    const txs: [string, string, number, number][] = [
      ["2026-08-01", "Rent August",      75000,  1],
      ["2026-08-01", "Pension savings",  50000, 18],
      ["2026-08-01", "Spotify",           1099,  7],
      ["2026-08-01", "iCloud",             299,  8],
      ["2026-08-01", "Claude",           10000,  9],
      ["2026-08-02", "Aldi",              2134, 10],
      ["2026-08-03", "Delhaize",          1876, 10],
      ["2026-08-03", "Uber Eats",         2450, 11],
      ["2026-08-04", "Kapper",            3500, 14],
      ["2026-08-05", "Carrefour",         3218, 10],
      ["2026-08-05", "AH",                 894, 10],
      ["2026-08-06", "Watergroep",        2500,  3],
      ["2026-08-07", "Aldi",              2867, 10],
      ["2026-08-08", "Fun evening",       4500, 12],
      ["2026-08-09", "Delhaize",          1543, 10],
      ["2026-08-09", "Parking Q-Park",     600, 15],
      ["2026-08-10", "Ikea",             12400, 19],
      ["2026-08-11", "Apotheek",          1890, 19],
      ["2026-08-12", "Gym membership",    4000, 16],
      ["2026-08-12", "AH",                2211, 10],
      ["2026-08-13", "Jumbo",             1745, 10],
      ["2026-08-13", "Uber Eats",         1890, 11],
      ["2026-08-14", "Clothes - Zara",    7900, 13],
      ["2026-08-15", "Birthday gift",     3000, 17],
    ];
    for (const [date, desc, cents, catId] of txs) {
      insertTx.run(date, "day", desc, cents, catId, "expense", "import", now);
    }

    // Merchant rules
    const rules: [string, number, number][] = [
      ["aldi", 10, 12], ["delhaize", 10, 9], ["carrefour", 10, 7],
      ["ah", 10, 6], ["jumbo", 10, 4], ["uber eats", 11, 8],
      ["kapper", 14, 4], ["spotify", 7, 3], ["icloud", 8, 3],
      ["claude", 9, 3], ["gym membership", 16, 3], ["watergroep", 3, 2],
      ["parking q-park", 15, 3], ["apotheek", 19, 5], ["ikea", 19, 2],
    ];
    for (const [pattern, catId, hits] of rules) {
      insertRule.run(pattern, catId, hits, "2026-08-01");
    }
  });

  if (count === 0) seedAll();

  // Idempotent: add July 2026 if not present
  const julyExists = (sqlite.prepare("SELECT COUNT(*) as n FROM months WHERE month = '2026-07'").get() as { n: number }).n;
  if (!julyExists) {
    const seedJuly = sqlite.transaction(() => {
      insertMonth.run("2026-07", 283500, 283500, 0.50, 0.25, 0.25);
      const julyLines: [number, number][] = [
        [1, 75000], [2, 12000], [3, 2500],  [4, 5000],  [5, 8000],  [6, 1500],
        [7, 1099],  [8, 299],   [9, 10000],
        [10,30000], [11,15000], [12,10000], [13,5000],  [14,3500],  [15,2000], [16,4000],
        [17,5000],  [18,50000], [19,2000],
      ];
      for (const [catId, planned] of julyLines) {
        insertLine.run("2026-07", catId, planned);
      }
      const now2 = new Date().toISOString();
      const julyTxs: [string, string, number, number][] = [
        ["2026-07-01", "Rent July",        75000,  1],
        ["2026-07-01", "Pension savings",  50000, 18],
        ["2026-07-01", "Spotify",           1099,  7],
        ["2026-07-01", "iCloud",             299,  8],
        ["2026-07-01", "Claude",           10000,  9],
        ["2026-07-03", "Aldi",              1876, 10],
        ["2026-07-05", "Delhaize",          2340, 10],
        ["2026-07-06", "Uber Eats",         1890, 11],
        ["2026-07-07", "AH",                1543, 10],
        ["2026-07-09", "Gym membership",    4000, 16],
        ["2026-07-10", "Carrefour",         2670, 10],
        ["2026-07-12", "Fun - cinema",      2500, 12],
        ["2026-07-14", "AH",                1980, 10],
        ["2026-07-15", "Kapper",            3500, 14],
        ["2026-07-16", "Jumbo",             1650, 10],
        ["2026-07-18", "Parking",            400, 15],
        ["2026-07-19", "Uber Eats",         2100, 11],
        ["2026-07-20", "Aldi",              2450, 10],
        ["2026-07-22", "Insurance",         8000,  5],
        ["2026-07-23", "AH",                1340, 10],
        ["2026-07-25", "Holiday souvenir",  4500, 17],
        ["2026-07-26", "Delhaize",          1890, 10],
        ["2026-07-28", "Apotheek",          1200, 19],
        ["2026-07-29", "Fun - concert",     3500, 12],
        ["2026-07-31", "Electricity",       9800,  2],
      ];
      for (const [date, desc, cents, catId] of julyTxs) {
        insertTx.run(date, "day", desc, cents, catId, "expense", "import", now2);
      }
    });
    seedJuly();
  }

  sqlite.close();
}
