# Category Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the fixed four-value `block` enum into a user-managed `category_groups` table, and move category creation from Settings to the Plan tab.

**Architecture:** A numbered `PRAGMA user_version` migration runner rebuilds the `categories` table (SQLite cannot drop a `CHECK` constraint), replacing `block TEXT` with `group_id INTEGER REFERENCES category_groups(id)`. Groups then flow from server components into the four client components as props, replacing five hardcoded constants. Category creation becomes a draft on the Plan page committed by `savePlan` in a single transaction alongside its budget line.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript strict, better-sqlite3 + Drizzle ORM, Zod v4, Vitest, Playwright.

**Spec:** [docs/specs/2026-08-17-category-groups.md](../specs/2026-08-17-category-groups.md)

## Global Constraints

- Money is integer cents everywhere, including intermediate values. Format only at the render edge.
- Categories and groups are **archived, never deleted**. `archived_at` is a `YYYY-MM-DD` string.
- Categories are referenced by id, never by name.
- Groups are cosmetic: nothing in allocation, pace or remaining may read `group_id`.
- Dates are `YYYY-MM-DD` strings, months are `YYYY-MM`. Timezone is Europe/Brussels; never derive a month from a UTC timestamp.
- All DB access goes through `src/lib/db/queries/*`. No inline SQL in components or routes.
- Every mutation is a Server Action returning a typed result, validated with Zod.
- Migrations are forward-only. Never edit a migration that has already run.
- Naming through the whole stack: table `category_groups`, column `group_id`, TypeScript `Group` / `groupId`, UI label "Group". The word `block` survives nowhere.
- Server Components by default; `'use client'` only where interaction demands it.
- Display formatting is Belgian (`€ 1.234,56`); interface language is English.
- Run from `budget-app/`: `npm test`, `npx tsc --noEmit`, `node verify-capture-order.js`, `node verify-month-persist.js`. The last two need the dev server running on port 3000.

---

### Task 1: Groups table, migration runner, and every read switched to groups

This task is deliberately large: renaming a column that five components and three query modules read cannot leave the tree compiling halfway. It ends with the app behaving exactly as it does today, with groups coming from the database.

**Files:**
- Modify: `src/lib/db/migrate.ts` (add runner + migration 001, change DDL and seed)
- Modify: `src/lib/db/schema.ts:3-10` (add `categoryGroups`, swap `block` for `groupId`)
- Create: `src/lib/db/queries/groups.ts`
- Modify: `src/lib/db/queries/categories.ts:54-68` (`insertCategory` takes `groupId`)
- Modify: `src/lib/db/queries/months.ts:49` (`categoryBlock` → `categoryGroupId`)
- Modify: `src/lib/db/queries/transactions.ts:20` (`categoryBlock` → `categoryGroupId`)
- Modify: `src/lib/types.ts:2,10` (drop `Block`, add `Group`, `Category.groupId`)
- Modify: `src/lib/actions/categories.ts:16` (Zod `block` enum → `groupId`)
- Modify: `src/app/plan/page.tsx`, `src/app/month/page.tsx`, `src/app/settings/page.tsx`, `src/app/capture/page.tsx` (pass `groups`)
- Modify: `src/components/plan/plan-client.tsx`, `src/components/month/transaction-list.tsx`, `src/components/capture/capture-form.tsx`, `src/components/settings/settings-client.tsx` (consume `groups`)
- Modify: `src/lib/mock-data.ts` (delete everything except `GOALS`)
- Create: `src/lib/db/migrate.test.ts`

**Interfaces:**
- Produces: `getActiveGroups(): { id: number; name: string; sortOrder: number; archivedAt: string | null }[]`
- Produces: `type Group = { id: number; name: string; sortOrder: number; archivedAt: string | null }` in `src/lib/types.ts`
- Produces: `insertCategory({ name, kind, groupId }): { id: number }`
- Produces: query rows expose `categoryGroupId: number` where they previously exposed `categoryBlock: string`

- [ ] **Step 1: Write the failing migration test**

Create `src/lib/db/migrate.test.ts`. It builds a database in the *old* shape, then runs the real migration over it.

```ts
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
    const names = read
      .prepare("SELECT name FROM category_groups ORDER BY sort_order")
      .all()
      .map((r: { name: string }) => r.name);
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/db/migrate.test.ts`
Expected: FAIL — `no such table: category_groups`.

- [ ] **Step 3: Add the migration runner and migration 001 to `migrate.ts`**

At the top of `src/lib/db/migrate.ts`, below the existing imports:

```ts
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
```

- [ ] **Step 4: Wire the runner into `migrateAndSeed`**

Migrations must run *before* the `CREATE TABLE IF NOT EXISTS` block, so they see the old shape. A database that has no `categories` table at all is brand new: it gets the current DDL and is stamped at the latest version without running any migration.

In `migrateAndSeed()`, immediately after the two `pragma` calls at the top:

```ts
  const isNewDatabase = !sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'categories'")
    .get();

  if (!isNewDatabase) applyMigrations(sqlite);
```

and immediately after the existing `sqlite.exec(\`…DDL…\`)` call:

```ts
  if (isNewDatabase) sqlite.pragma(`user_version = ${LATEST_VERSION}`);
```

- [ ] **Step 5: Update the DDL and the seed in `migrate.ts`**

In the DDL string, add the groups table above `categories` and replace the `block` column:

```sql
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
```

Replace the `insertCat` prepared statement and seed the groups first inside `seedAll`:

```ts
  const insertGroup = sqlite.prepare(
    "INSERT OR IGNORE INTO category_groups (name, sort_order) VALUES (?, ?)"
  );
  const insertCat = sqlite.prepare(
    "INSERT INTO categories (name, kind, group_id, sort_order) VALUES (?, ?, ?, ?)"
  );
```

At the top of the `seedAll` transaction body, before the category loop:

```ts
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
```

and change the loop that inserts categories to map its third element through `GROUP_OF`:

```ts
    for (const [name, kind, block, order] of cats) {
      insertCat.run(name, kind, GROUP_OF[block], order);
    }
```

The `cats` array keeps its existing literal values — `block` is only a lookup key here.

- [ ] **Step 6: Run the migration test to green**

Run: `npx vitest run src/lib/db/migrate.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Update the Drizzle schema**

In `src/lib/db/schema.ts`, add above `categories`:

```ts
export const categoryGroups = sqliteTable("category_groups", {
  id:         integer("id").primaryKey({ autoIncrement: true }),
  name:       text("name").notNull().unique(),
  sortOrder:  integer("sort_order").notNull().default(0),
  archivedAt: text("archived_at"),
});
```

and replace the `block` column in `categories` with:

```ts
  groupId:    integer("group_id").notNull().references(() => categoryGroups.id),
```

- [ ] **Step 8: Add the groups query module**

Create `src/lib/db/queries/groups.ts`:

```ts
import { db } from "../index";
import { categoryGroups, categories } from "../schema";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

export function getActiveGroups() {
  return db
    .select()
    .from(categoryGroups)
    .where(isNull(categoryGroups.archivedAt))
    .orderBy(asc(categoryGroups.sortOrder))
    .all();
}

export function getAllGroups() {
  return db.select().from(categoryGroups).orderBy(asc(categoryGroups.sortOrder)).all();
}

/** Active categories per group — what the Settings tab shows, and what blocks archiving. */
export function getGroupsWithCounts() {
  return db
    .select({
      id:         categoryGroups.id,
      name:       categoryGroups.name,
      sortOrder:  categoryGroups.sortOrder,
      archivedAt: categoryGroups.archivedAt,
      activeCategories: sql<number>`(
        SELECT COUNT(*) FROM categories c
        WHERE c.group_id = ${categoryGroups.id} AND c.archived_at IS NULL
      )`.as("active_categories"),
    })
    .from(categoryGroups)
    .orderBy(asc(categoryGroups.sortOrder))
    .all();
}

export function countActiveCategoriesInGroup(groupId: number) {
  const row = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(categories)
    .where(and(eq(categories.groupId, groupId), isNull(categories.archivedAt)))
    .get();
  return row?.n ?? 0;
}
```

- [ ] **Step 9: Switch the remaining queries and types off `block`**

`src/lib/db/queries/categories.ts` — `insertCategory` takes a group and returns the new id:

```ts
export function insertCategory(data: {
  name: string;
  kind: "need" | "want" | "save";
  groupId: number;
}) {
  const max = db
    .select({ value: sql<number>`COALESCE(MAX(${categories.sortOrder}), 0)` })
    .from(categories)
    .where(eq(categories.groupId, data.groupId))
    .get();

  return db
    .insert(categories)
    .values({ ...data, sortOrder: (max?.value ?? 0) + 1 })
    .returning({ id: categories.id })
    .get();
}
```

`src/lib/db/queries/months.ts:49` and `src/lib/db/queries/transactions.ts:20` — replace the selected column:

```ts
      categoryGroupId: categories.groupId,
```

`src/lib/types.ts` — delete `export type Block`, add `Group`, and change `Category`:

```ts
export interface Group {
  id: number;
  name: string;
  sortOrder: number;
  archivedAt: string | null;
}

export interface Category {
  id: number;
  name: string;
  kind: Kind;
  groupId: number;
  sortOrder: number;
  archivedAt: string | null;
}
```

`src/lib/actions/categories.ts:16` — the Zod field becomes:

```ts
  groupId: z.number().int().positive(),
```

- [ ] **Step 10: Feed groups into the four screens**

Each server page adds one query and one prop. In `src/app/plan/page.tsx`, `src/app/month/page.tsx`, `src/app/capture/page.tsx` and `src/app/settings/page.tsx`:

```ts
import { getActiveGroups } from "@/lib/db/queries/groups";
// …
const groups = getActiveGroups();
```

pass `groups={groups}` to `PlanClient`, `MonthTransactionList`, `CaptureForm` (via `CaptureClient`) and `SettingsClient`. In `month/page.tsx` also delete the `BLOCKS` constant and drive the block loop from the data:

```tsx
      {groups.map((group) => {
        const blockLines = lines.filter((l) => l.categoryGroupId === group.id);
        if (!blockLines.length) return null;
        // …unchanged body, with group.name as the heading…
```

Rename the local `block`/`blockLines` identifiers to `group`/`groupLines` as you go — no `block` may survive.

- [ ] **Step 11: Switch the four client components to the prop**

- `src/components/plan/plan-client.tsx`: delete the `BLOCKS` constant, add `groups: Group[]` to props, replace `catInfo`'s `block: string` with `groupId: number`, change `addingBlock: string | null` to `addingGroupId: number | null`, and iterate `groups.map((group) => …)` filtering on `catInfo.get(d.categoryId)?.groupId === group.id`. The heading becomes `{group.name}`.
- `src/components/month/transaction-list.tsx`: delete the `BLOCKS` constant, add `groups: Group[]`, change `type Cat`'s `block: string` to `groupId: number`, and label each `<optgroup>` with `group.name`.
- `src/components/capture/capture-form.tsx:381`: replace the inline `["living", …]` array with the `groups` prop (threaded through `CaptureClient`), filtering `filteredCats.filter((c) => c.groupId === group.id)` and rendering `group.name` as the section label.
- `src/components/settings/settings-client.tsx`: delete the `BLOCKS` constant, take `groups: Group[]`, group the category table by `c.groupId`, and change `NewCategoryForm`'s block `<select>` to a group `<select>` whose options are `groups`. (This tab is replaced wholesale in Task 4; this step only keeps it compiling and working.)

- [ ] **Step 12: Delete the stale mock data**

`src/lib/mock-data.ts` carries a `CATEGORIES` array with `block` values and nothing imports it. Only `GOALS` is used, by `src/app/goals/page.tsx`. Delete every other export (`CATEGORIES`, `CURRENT_MONTH`, `BUDGET_LINES`, `TRANSACTIONS`, `getSpentByCategoryId`, `ENRICHED_BUDGET_LINES`, `MONTHLY_TOTALS`) and any imports left unused.

- [ ] **Step 13: Verify the whole tree**

Run: `npx tsc --noEmit`
Expected: clean — this is the real gate for this task; it proves no `block` reference survives.

Run: `npm test`
Expected: PASS — the 23 existing tests plus the 5 new migration tests.

Run: `grep -rn "block" src --include=*.ts --include=*.tsx | grep -vi "display: \"block\"\|block-start\|block-end"`
Expected: no matches.

- [ ] **Step 14: Verify against the real database and the browser**

The dev server on port 3000 will apply migration 001 to `data/budget.db` on the next request. Back it up first:

```bash
cp data/budget.db /tmp/budget-pre-migration.db
node -e "const D=require('better-sqlite3');const d=new D('data/budget.db',{readonly:true});console.log(d.prepare('SELECT COUNT(*) n FROM categories').get(), d.prepare('SELECT COUNT(*) n FROM transactions').get())"
curl -s http://localhost:3000/month?month=2026-08 > /dev/null
node -e "const D=require('better-sqlite3');const d=new D('data/budget.db',{readonly:true});console.log(d.pragma('user_version',{simple:true}), d.prepare('SELECT COUNT(*) n FROM categories').get(), d.prepare('SELECT COUNT(*) n FROM transactions').get(), d.prepare('SELECT name FROM category_groups ORDER BY sort_order').all())"
```

Expected: `user_version` 1, category count unchanged at 19, transaction count unchanged, four groups listed.

Run: `node verify-capture-order.js && node verify-month-persist.js`
Expected: both report `all checks passed`.

- [ ] **Step 15: Commit**

```bash
git add src/lib/db src/lib/types.ts src/lib/actions/categories.ts src/lib/mock-data.ts src/app src/components
git commit -m "feat: category groups become a table, replacing the fixed block enum"
```

---

### Task 2: Group CRUD on the server

**Files:**
- Modify: `src/lib/db/queries/groups.ts` (add writes)
- Create: `src/lib/actions/groups.ts`
- Create: `src/lib/db/queries/groups.test.ts`

**Interfaces:**
- Consumes: `getActiveGroups`, `getGroupsWithCounts`, `countActiveCategoriesInGroup` (Task 1)
- Produces: `createGroup({ name })`, `renameGroup({ id, name })`, `moveGroup({ id, direction })`, `archiveGroup(id)`, `restoreGroup(id)` — all `async`, all returning `{ ok: true } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing query tests**

Create `src/lib/db/queries/groups.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-groups-"));
process.env.BUDGET_DB_PATH = path.join(tmpDir, "test.db");

const { migrateAndSeed } = await import("../migrate");
const {
  getActiveGroups,
  getGroupsWithCounts,
  countActiveCategoriesInGroup,
  insertGroup,
  renameGroupRow,
  moveGroupRow,
  setGroupArchived,
} = await import("./groups");
const { insertCategory, setCategoryArchived } = await import("./categories");

migrateAndSeed();

const names = () => getActiveGroups().map((g) => g.name);

describe("groups", () => {
  it("appends a new group after the existing ones", () => {
    insertGroup("Yearly costs");
    expect(names()).toEqual([
      "Living expenses", "Subscriptions", "Regular expenses", "Miscellaneous", "Yearly costs",
    ]);
  });

  it("renames in place without reordering", () => {
    const target = getActiveGroups().find((g) => g.name === "Miscellaneous")!;
    renameGroupRow(target.id, "Other stuff");
    expect(names()[3]).toBe("Other stuff");
  });

  it("swaps sort order with the neighbour when moved", () => {
    const before = names();
    const second = getActiveGroups()[1];
    moveGroupRow(second.id, "up");
    const after = names();
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
  });

  it("counts only active categories in a group", () => {
    const group = getActiveGroups().find((g) => g.name === "Yearly costs")!;
    expect(countActiveCategoriesInGroup(group.id)).toBe(0);

    const created = insertCategory({ name: "Car tax", kind: "need", groupId: group.id });
    expect(countActiveCategoriesInGroup(group.id)).toBe(1);

    setCategoryArchived(created.id, "2026-08-17");
    expect(countActiveCategoriesInGroup(group.id)).toBe(0);
  });

  it("reports active counts alongside every group, archived ones included", () => {
    const group = getActiveGroups().find((g) => g.name === "Yearly costs")!;
    setGroupArchived(group.id, "2026-08-17");

    const all = getGroupsWithCounts();
    expect(all.find((g) => g.name === "Yearly costs")?.archivedAt).toBe("2026-08-17");
    expect(getActiveGroups().some((g) => g.name === "Yearly costs")).toBe(false);

    const living = all.find((g) => g.name === "Living expenses")!;
    expect(living.activeCategories).toBe(6);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/db/queries/groups.test.ts`
Expected: FAIL — `insertGroup is not a function`.

- [ ] **Step 3: Add the write queries**

Append to `src/lib/db/queries/groups.ts`:

```ts
export function insertGroup(name: string) {
  const max = db
    .select({ value: sql<number>`COALESCE(MAX(${categoryGroups.sortOrder}), 0)` })
    .from(categoryGroups)
    .get();

  return db
    .insert(categoryGroups)
    .values({ name, sortOrder: (max?.value ?? 0) + 1 })
    .returning({ id: categoryGroups.id })
    .get();
}

export function renameGroupRow(id: number, name: string) {
  return db.update(categoryGroups).set({ name }).where(eq(categoryGroups.id, id)).run();
}

// Groups are archived, never deleted — archived categories still point at them.
export function setGroupArchived(id: number, archivedAt: string | null) {
  return db.update(categoryGroups).set({ archivedAt }).where(eq(categoryGroups.id, id)).run();
}

/** Swaps sort_order with the adjacent active group. No-op at either end. */
export function moveGroupRow(id: number, direction: "up" | "down") {
  const ordered = getActiveGroups();
  const index = ordered.findIndex((g) => g.id === id);
  if (index === -1) return;
  const neighbour = ordered[direction === "up" ? index - 1 : index + 1];
  if (!neighbour) return;

  const self = ordered[index];
  db.transaction((tx) => {
    tx.update(categoryGroups).set({ sortOrder: neighbour.sortOrder }).where(eq(categoryGroups.id, self.id)).run();
    tx.update(categoryGroups).set({ sortOrder: self.sortOrder }).where(eq(categoryGroups.id, neighbour.id)).run();
  });
}
```

If two groups share a `sort_order` the swap is a no-op; `insertGroup` always takes `max + 1`, and the seed assigns 1–4, so ties cannot arise.

- [ ] **Step 4: Run the tests to green**

Run: `npx vitest run src/lib/db/queries/groups.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the server actions**

Create `src/lib/actions/groups.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { ensureDb } from "@/lib/db/ensure-ready";
import {
  insertGroup,
  renameGroupRow,
  moveGroupRow,
  setGroupArchived,
  countActiveCategoriesInGroup,
} from "@/lib/db/queries/groups";
import { today } from "@/lib/format";
import { z } from "zod/v4";

const NameSchema = z.object({ name: z.string().trim().min(1, "Name is required").max(40) });
const RenameSchema = NameSchema.extend({ id: z.number().int().positive() });
const MoveSchema = z.object({ id: z.number().int().positive(), direction: z.enum(["up", "down"]) });
const IdSchema = z.number().int().positive();

function revalidate() {
  revalidatePath("/settings");
  revalidatePath("/plan");
  revalidatePath("/month");
  revalidatePath("/capture");
}

function uniqueNameError(err: unknown, name: string) {
  if (err instanceof Error && err.message.includes("UNIQUE")) {
    return { ok: false as const, error: `A group named "${name}" already exists` };
  }
  return null;
}

export async function createGroup(raw: unknown) {
  ensureDb();
  const parsed = NameSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  try {
    insertGroup(parsed.data.name);
  } catch (err) {
    const conflict = uniqueNameError(err, parsed.data.name);
    if (conflict) return conflict;
    throw err;
  }
  revalidate();
  return { ok: true as const };
}

export async function renameGroup(raw: unknown) {
  ensureDb();
  const parsed = RenameSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  try {
    renameGroupRow(parsed.data.id, parsed.data.name);
  } catch (err) {
    const conflict = uniqueNameError(err, parsed.data.name);
    if (conflict) return conflict;
    throw err;
  }
  revalidate();
  return { ok: true as const };
}

export async function moveGroup(raw: unknown) {
  ensureDb();
  const parsed = MoveSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  moveGroupRow(parsed.data.id, parsed.data.direction);
  revalidate();
  return { ok: true as const };
}

export async function archiveGroup(rawId: unknown) {
  ensureDb();
  const id = IdSchema.parse(rawId);
  const occupied = countActiveCategoriesInGroup(id);
  if (occupied > 0) {
    return {
      ok: false as const,
      error: `This group still holds ${occupied} ${occupied === 1 ? "category" : "categories"} — move them first`,
    };
  }
  setGroupArchived(id, today());
  revalidate();
  return { ok: true as const };
}

export async function restoreGroup(rawId: unknown) {
  ensureDb();
  setGroupArchived(IdSchema.parse(rawId), null);
  revalidate();
  return { ok: true as const };
}
```

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all tests pass.

```bash
git add src/lib/db/queries/groups.ts src/lib/db/queries/groups.test.ts src/lib/actions/groups.ts
git commit -m "feat: group create, rename, reorder and archive"
```

---

### Task 3: `savePlan` creates categories

**Files:**
- Modify: `src/lib/db/queries/months.ts` (`replaceBudgetLines` takes an executor; add `savePlanLines`)
- Modify: `src/lib/actions/months.ts:14-41` (Zod union, call the new query)
- Create: `src/lib/actions/save-plan.test.ts`

**Interfaces:**
- Consumes: `insertCategory({ name, kind, groupId }): { id: number }` (Task 1)
- Produces: `savePlanLines(month: string, lines: PlanLine[]): { categoryId: number; plannedCents: number }[]` where
  `type PlanLine = { categoryId: number; plannedCents: number } | { newCategory: { name: string; kind: "need"|"want"|"save"; groupId: number }; plannedCents: number }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/actions/save-plan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-saveplan-"));
process.env.BUDGET_DB_PATH = path.join(tmpDir, "test.db");

const { migrateAndSeed } = await import("../db/migrate");
const { savePlanLines, getBudgetLinesForMonth } = await import("../db/queries/months");
const { getAllCategories } = await import("../db/queries/categories");
const { getActiveGroups } = await import("../db/queries/groups");

migrateAndSeed();

const MONTH = "2026-08";

describe("savePlanLines", () => {
  it("creates a new category and its line in one call", () => {
    const group = getActiveGroups()[0];
    const existing = getBudgetLinesForMonth(MONTH);

    savePlanLines(MONTH, [
      ...existing.map((l) => ({ categoryId: l.categoryId, plannedCents: l.plannedCents })),
      { newCategory: { name: "Car tax", kind: "need" as const, groupId: group.id }, plannedCents: 4_500 },
    ]);

    const created = getAllCategories().find((c) => c.name === "Car tax");
    expect(created).toBeDefined();
    expect(created!.groupId).toBe(group.id);

    const line = getBudgetLinesForMonth(MONTH).find((l) => l.categoryId === created!.id);
    expect(line?.plannedCents).toBe(4_500);
  });

  it("writes nothing at all when a new category name collides", () => {
    const group = getActiveGroups()[0];
    const before = getBudgetLinesForMonth(MONTH).map((l) => [l.categoryId, l.plannedCents]);
    const categoriesBefore = getAllCategories().length;

    expect(() =>
      savePlanLines(MONTH, [
        { categoryId: before[0][0], plannedCents: 99_999 },
        // valid — created first, and must be rolled back when the next line throws
        { newCategory: { name: "Water bill", kind: "need" as const, groupId: group.id }, plannedCents: 2_500 },
        // "Rent" already exists: categories.name is UNIQUE
        { newCategory: { name: "Rent", kind: "need" as const, groupId: group.id }, plannedCents: 1_000 },
      ])
    ).toThrow(/UNIQUE/);

    // The category created before the failure is the real proof the transaction rolled back.
    expect(getAllCategories().some((c) => c.name === "Water bill")).toBe(false);
    expect(getAllCategories()).toHaveLength(categoriesBefore);
    expect(getBudgetLinesForMonth(MONTH).map((l) => [l.categoryId, l.plannedCents])).toEqual(before);
  });

  it("still edits, adds and removes existing lines", () => {
    const before = getBudgetLinesForMonth(MONTH);
    const kept = before.slice(1);

    savePlanLines(MONTH, kept.map((l) => ({ categoryId: l.categoryId, plannedCents: l.plannedCents })));

    const after = getBudgetLinesForMonth(MONTH).map((l) => l.categoryId);
    expect(after).not.toContain(before[0].categoryId);
    expect(after).toHaveLength(kept.length);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/actions/save-plan.test.ts`
Expected: FAIL — `savePlanLines is not a function`.

- [ ] **Step 3: Let `replaceBudgetLines` run inside a caller's transaction**

In `src/lib/db/queries/months.ts`, add the executor type near the imports and thread it through — the existing body is unchanged apart from `db` becoming `exec`:

```ts
type Exec = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export function replaceBudgetLines(
  month: string,
  lines: { categoryId: number; plannedCents: number }[],
  exec: Exec = db
) {
  const keep = lines.map((l) => l.categoryId);
  for (const line of lines) {
    exec
      .insert(budgetLines)
      .values({ month, categoryId: line.categoryId, plannedCents: line.plannedCents })
      .onConflictDoUpdate({
        target: [budgetLines.month, budgetLines.categoryId],
        set: { plannedCents: line.plannedCents },
      })
      .run();
  }
  exec
    .delete(budgetLines)
    .where(
      keep.length
        ? and(eq(budgetLines.month, month), notInArray(budgetLines.categoryId, keep))
        : eq(budgetLines.month, month)
    )
    .run();
}
```

`upsertBudgetLine` loses its only caller here; leave it in place, it is still exported for the Plan page's single-line path.

- [ ] **Step 4: Add `savePlanLines`**

Also in `src/lib/db/queries/months.ts`:

```ts
export type PlanLine =
  | { categoryId: number; plannedCents: number }
  | {
      newCategory: { name: string; kind: "need" | "want" | "save"; groupId: number };
      plannedCents: number;
    };

/** Creates any brand-new categories and reconciles the month's lines in one transaction.
 *  A duplicate category name aborts the whole save — no orphan category, no partial plan. */
export function savePlanLines(month: string, lines: PlanLine[]) {
  return db.transaction((tx) => {
    const resolved = lines.map((line) => {
      if ("categoryId" in line) return { categoryId: line.categoryId, plannedCents: line.plannedCents };

      const max = tx
        .select({ value: sql<number>`COALESCE(MAX(${categories.sortOrder}), 0)` })
        .from(categories)
        .where(eq(categories.groupId, line.newCategory.groupId))
        .get();

      const created = tx
        .insert(categories)
        .values({ ...line.newCategory, sortOrder: (max?.value ?? 0) + 1 })
        .returning({ id: categories.id })
        .get();

      return { categoryId: created.id, plannedCents: line.plannedCents };
    });

    replaceBudgetLines(month, resolved, tx);
    return resolved;
  });
}
```

Add `categories` to the existing `../schema` import if it is not already there.

- [ ] **Step 5: Run the tests to green**

Run: `npx vitest run src/lib/actions/save-plan.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Widen the `savePlan` action**

In `src/lib/actions/months.ts`, replace the `lines` field of `MonthSchema`:

```ts
  lines: z.array(
    z.union([
      z.object({
        categoryId:   z.number().int().positive(),
        plannedCents: z.number().int().nonnegative(),
      }),
      z.object({
        newCategory: z.object({
          name:    z.string().trim().min(1, "Name is required").max(40),
          kind:    z.enum(["need", "want", "save"]),
          groupId: z.number().int().positive(),
        }),
        plannedCents: z.number().int().nonnegative(),
      }),
    ])
  ),
```

and in the body, swap `replaceBudgetLines` for the transactional version, translating the UNIQUE violation into a typed error:

```ts
  try {
    savePlanLines(month.month, lines);
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return { ok: false as const, error: "A category with that name already exists" };
    }
    throw err;
  }
  revalidatePath("/plan");
  revalidatePath("/month");
  revalidatePath("/capture");
  return { ok: true as const };
```

Import `savePlanLines` instead of `replaceBudgetLines`. Note `upsertMonth` still runs before it; that is intentional — income and percentages are not affected by a line-level failure, and re-saving is idempotent.

- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all tests pass.

```bash
git add src/lib/db/queries/months.ts src/lib/actions/months.ts src/lib/actions/save-plan.test.ts
git commit -m "feat: savePlan creates new categories in the same transaction"
```

---

### Task 4: Settings — Groups tab replaces Categories

**Files:**
- Modify: `src/app/settings/page.tsx` (query groups with counts instead of categories)
- Modify: `src/components/settings/settings-client.tsx:13-190` (replace `CategoriesTab` with `GroupsTab`)

**Interfaces:**
- Consumes: `getGroupsWithCounts()` (Task 1), `createGroup` / `renameGroup` / `moveGroup` / `archiveGroup` / `restoreGroup` (Task 2)

- [ ] **Step 1: Swap the page's data**

In `src/app/settings/page.tsx`, replace the `getAllCategories()` call with `getGroupsWithCounts()` and pass `groups` to `SettingsClient` in place of `categories`. `getMerchantRules()` stays.

- [ ] **Step 2: Replace the tab**

In `src/components/settings/settings-client.tsx`: change `TabKey` to `"groups" | "rules" | "danger"`, default the state to `"groups"`, label it "Groups", and delete `CategoriesTab`, `NewCategoryForm`, `CategoryRow`, `ArchivedRow` and the `Category` type along with the now-unused `createCategory` / `archiveCategory` / `restoreCategory` imports. Add:

```tsx
type GroupRow = {
  id: number;
  name: string;
  sortOrder: number;
  archivedAt: string | null;
  activeCategories: number;
};

function GroupsTab({ groups }: { groups: GroupRow[] }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const active = groups.filter((g) => !g.archivedAt);
  const archived = groups.filter((g) => g.archivedAt);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) setError(result.error ?? "That did not work");
    });

  const submitNewGroup = () => {
    if (!name.trim()) return;
    run(() => createGroup({ name }));
    setName("");
    setAdding(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span className="muted">{active.length} groups</span>
        <button className="btn btn-primary" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ New group"}
        </button>
      </div>

      {adding && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, padding: "12px 14px", background: "var(--color-surface)" }}>
          <input
            className="input"
            autoFocus
            value={name}
            placeholder="Group name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitNewGroup(); }}
            style={{ height: 30, fontSize: 13, width: 220 }}
          />
          <button
            className="btn btn-primary"
            disabled={isPending || !name.trim()}
            onClick={submitNewGroup}
            style={{ height: 30, fontSize: 13 }}
          >
            Add
          </button>
        </div>
      )}

      {error && (
        <div role="alert" style={{ fontSize: 13, color: "var(--over-text)", fontWeight: 600, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Group</th>
            <th style={{ width: 120 }}>Categories</th>
            <th style={{ width: 90 }}>Order</th>
            <th style={{ width: 140 }} />
          </tr>
        </thead>
        <tbody>
          {active.map((group, i) => (
            <tr key={group.id} style={{ opacity: isPending ? 0.5 : 1 }}>
              <td style={{ fontSize: 14 }}>
                <InlineRename group={group} onError={setError} />
              </td>
              <td style={{ fontSize: 13, color: "var(--i55)" }}>{group.activeCategories}</td>
              <td>
                <button
                  onClick={() => run(() => moveGroup({ id: group.id, direction: "up" }))}
                  disabled={i === 0}
                  style={{ all: "unset", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.3 : 1, padding: "0 4px" }}
                  aria-label={`Move ${group.name} up`}
                >▲</button>
                <button
                  onClick={() => run(() => moveGroup({ id: group.id, direction: "down" }))}
                  disabled={i === active.length - 1}
                  style={{ all: "unset", cursor: i === active.length - 1 ? "default" : "pointer", opacity: i === active.length - 1 ? 0.3 : 1, padding: "0 4px" }}
                  aria-label={`Move ${group.name} down`}
                >▼</button>
              </td>
              <td>
                <button
                  onClick={() => run(() => archiveGroup(group.id))}
                  style={{ all: "unset", fontSize: 12, color: "var(--i40)", cursor: "pointer" }}
                >
                  Archive
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {archived.length > 0 && (
        <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--color-divider)" }}>
          <h6 className="section-label" style={{ marginBottom: 12 }}>
            Archived ({archived.length}) — history preserved
          </h6>
          <table>
            <tbody>
              {archived.map((group) => (
                <tr key={group.id} style={{ opacity: 0.5 }}>
                  <td style={{ fontSize: 14 }}>{group.name}</td>
                  <td style={{ width: 140 }}>
                    <button
                      onClick={() => run(() => restoreGroup(group.id))}
                      style={{ all: "unset", fontSize: 12, color: "var(--sig-ok)", cursor: "pointer" }}
                    >
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InlineRename({
  group,
  onError,
}: {
  group: GroupRow;
  onError: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(group.name);
  const [, startTransition] = useTransition();

  const commit = () => {
    setEditing(false);
    if (value.trim() === group.name || !value.trim()) { setValue(group.name); return; }
    startTransition(async () => {
      const result = await renameGroup({ id: group.id, name: value });
      if (!result.ok) { onError(result.error ?? "Rename failed"); setValue(group.name); }
    });
  };

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} style={{ all: "unset", cursor: "text" }}>
        {group.name}
      </button>
    );
  }

  return (
    <input
      className="input"
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { setValue(group.name); setEditing(false); }
      }}
      style={{ height: 26, fontSize: 13, width: 200 }}
    />
  );
}
```

Import the five group actions from `@/lib/actions/groups` at the top of the file.

- [ ] **Step 3: Verify by hand**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all tests pass.

With the dev server running, open `http://localhost:3000/settings` and check: adding a group appends it; renaming persists after reload; ▲▼ reorder and the new order shows up as section order on `/plan` and `/month`; archiving a group holding categories is refused with the count in the message; archiving an empty group moves it to the archived list; restoring brings it back.

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/page.tsx src/components/settings/settings-client.tsx
git commit -m "feat: Settings manages groups instead of categories"
```

---

### Task 5: Plan — create a category inline

**Files:**
- Modify: `src/components/plan/plan-client.tsx` (draft union, new-category editor, payload)

**Interfaces:**
- Consumes: `savePlan` with the union payload (Task 3), `groups: Group[]` (Task 1)

- [ ] **Step 1: Widen the draft type**

Replace the `Draft` type and the helpers that read it:

```ts
type Draft =
  | { source: "existing"; key: string; categoryId: number; raw: string }
  | { source: "new"; key: string; name: string; catKind: PlanKind; groupId: number; raw: string };
```

`key` is the React list key and the handle for edit/remove: `String(categoryId)` for existing rows, `new-${n}` for new ones, where `n` comes from `const newKeyCounter = useRef(0)` — never `Math.random()`, which would change on every render. `updateDraft`, `removeDraft` and `addDraft` all switch their first parameter from `categoryId` to `key`. The `focusOn` state changes type from `number | null` to `string | null`, and the amount input's `autoFocus` becomes `focusOn === draft.key`.

Resolve a draft's display fields through one helper so the table body stays simple:

```ts
function draftInfo(draft: Draft, catInfo: Map<number, { name: string; kind: PlanKind; groupId: number }>) {
  return draft.source === "existing"
    ? catInfo.get(draft.categoryId)
    : { name: draft.name, kind: draft.catKind, groupId: draft.groupId };
}
```

Every place that currently calls `catInfo.get(d.categoryId)` — the group filter, the totals mapping, the row rendering — goes through `draftInfo` instead, so an unsaved category counts toward its group total and the need/want/save summary immediately.

- [ ] **Step 2: Add the "＋ New category…" option**

In the per-group add control, prepend an option to the existing `<select>`:

```tsx
<option value="new">＋ New category…</option>
```

and branch in its `onChange`: `"new"` opens the inline editor for that group, any other value calls `addDraft` as today.

The editor is a row rendered under the table when `newFor === group.id`:

```tsx
{newFor === group.id && (
  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
    <input
      className="input"
      autoFocus
      value={newName}
      placeholder="Category name"
      onChange={(e) => { setNewName(e.target.value); setNewError(null); }}
      onKeyDown={(e) => { if (e.key === "Enter") commitNewCategory(group.id); if (e.key === "Escape") setNewFor(null); }}
      style={{ height: 28, fontSize: 13, width: 180 }}
    />
    <select
      className="input"
      value={newKind}
      onChange={(e) => setNewKind(e.target.value as PlanKind)}
      style={{ height: 28, fontSize: 13 }}
    >
      <option value="need">need</option>
      <option value="want">want</option>
      <option value="save">save</option>
    </select>
    <button
      className="btn btn-primary"
      onClick={() => commitNewCategory(group.id)}
      disabled={!newName.trim()}
      style={{ height: 28, fontSize: 13 }}
    >
      Add
    </button>
    {newError && <span role="alert" style={{ fontSize: 12, color: "var(--over-text)", fontWeight: 600 }}>{newError}</span>}
  </div>
)}
```

- [ ] **Step 3: Reject duplicate names before the server sees them**

```ts
function commitNewCategory(groupId: number) {
  const name = newName.trim();
  if (!name) return;

  const lower = name.toLowerCase();
  const clashesWithCategory = categories.some((c) => c.name.toLowerCase() === lower);
  const clashesWithDraft = drafts.some((d) => d.source === "new" && d.name.toLowerCase() === lower);
  if (clashesWithCategory) {
    setNewError(`"${name}" already exists — add it as a line instead`);
    return;
  }
  if (clashesWithDraft) {
    setNewError(`"${name}" is already on this plan`);
    return;
  }

  const key = `new-${++newKeyCounter.current}`;
  setDrafts((ds) => [...ds, { source: "new", key, name, catKind: newKind, groupId, raw: "0,00" }]);
  setNewFor(null);
  setNewName("");
  setFocusOn(key);
}
```

`categories` here is the active list already passed to the component. An archived category with the same name is **not** in that list, so it falls through to the server, which returns "A category with that name already exists" — surface it in the existing `saveError` slot. That is the intended behaviour: the fix is to restore the category from the archived section (Task 6), not to create a second one.

- [ ] **Step 4: Send the union payload**

In `handleSave`:

```ts
        lines: drafts.map((d) =>
          d.source === "existing"
            ? { categoryId: d.categoryId, plannedCents: centsOf(d.raw) }
            : {
                newCategory: { name: d.name, kind: d.catKind, groupId: d.groupId },
                plannedCents: centsOf(d.raw),
              }
        ),
```

After a successful save the page must re-read from the server so new categories arrive with real ids — call `router.refresh()` alongside the existing `setSaved(true)`. Without it the next save would try to create them again.

Also extend `snapshot()` so a pending new category counts as a dirty change:

```ts
function snapshot(income: number, pcts: number[], drafts: Draft[]) {
  const lines = drafts
    .map((d) => (d.source === "existing" ? [String(d.categoryId), centsOf(d.raw)] : [`new:${d.name}:${d.groupId}`, centsOf(d.raw)]))
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify([income, pcts, lines]);
}
```

- [ ] **Step 5: Verify by hand**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all tests pass.

In the browser on `/plan`: add a new category to a group, confirm the group total and the Need/Want/Save summary update *before* saving; press "Save plan"; reload and confirm the line persists; open `/capture` and confirm the category appears in the picker under the right group. Then try adding a category named `Rent` and confirm the inline error appears and nothing is sent.

- [ ] **Step 6: Commit**

```bash
git add src/components/plan/plan-client.tsx
git commit -m "feat: create a category from the Plan tab"
```

---

### Task 6: Plan — rename, archive and restore categories

**Files:**
- Modify: `src/lib/db/queries/categories.ts` (add `renameCategoryRow`)
- Modify: `src/lib/actions/categories.ts` (add `renameCategory`; `createCategory` keeps its group field)
- Modify: `src/app/plan/page.tsx` (pass archived categories)
- Modify: `src/components/plan/plan-client.tsx` (row actions + archived section)
- Create: `src/lib/db/queries/categories.test.ts`

**Interfaces:**
- Consumes: `archiveCategory(id)`, `restoreCategory(id)` (existing actions)
- Produces: `renameCategoryRow(id: number, name: string)` in the query layer
- Produces: `renameCategory({ id, name })` returning `{ ok: true } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing rename test**

Create `src/lib/db/queries/categories.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-cats-"));
process.env.BUDGET_DB_PATH = path.join(tmpDir, "test.db");

const { migrateAndSeed } = await import("../migrate");
const { getAllCategories, renameCategoryRow, setCategoryArchived } = await import("./categories");

migrateAndSeed();

const byName = (name: string) => getAllCategories().find((c) => c.name === name);

describe("renameCategoryRow", () => {
  it("renames in place, keeping id, kind and group", () => {
    const before = byName("Fun")!;
    renameCategoryRow(before.id, "Fun money");

    const after = getAllCategories().find((c) => c.id === before.id)!;
    expect(after.name).toBe("Fun money");
    expect(after.kind).toBe(before.kind);
    expect(after.groupId).toBe(before.groupId);
    expect(byName("Fun")).toBeUndefined();
  });

  it("refuses a name already taken by an active category", () => {
    const target = byName("Gym")!;
    expect(() => renameCategoryRow(target.id, "Groceries")).toThrow(/UNIQUE/);
    expect(byName("Gym")).toBeDefined();
  });

  it("refuses a name held by an archived category — UNIQUE covers archived rows", () => {
    const archived = byName("Clothes")!;
    setCategoryArchived(archived.id, "2026-08-17");

    const target = byName("Gifts")!;
    expect(() => renameCategoryRow(target.id, "Clothes")).toThrow(/UNIQUE/);
    expect(byName("Gifts")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/db/queries/categories.test.ts`
Expected: FAIL — `renameCategoryRow is not a function`.

- [ ] **Step 3: Add the rename query and action**

`src/lib/db/queries/categories.ts`:

```ts
export function renameCategoryRow(id: number, name: string) {
  return db.update(categories).set({ name }).where(eq(categories.id, id)).run();
}
```

`src/lib/actions/categories.ts`:

```ts
const RenameSchema = z.object({
  id:   z.number().int().positive(),
  name: z.string().trim().min(1, "Name is required").max(40),
});

export async function renameCategory(raw: unknown) {
  ensureDb();
  const parsed = RenameSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  try {
    renameCategoryRow(parsed.data.id, parsed.data.name);
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return { ok: false as const, error: `"${parsed.data.name}" already exists` };
    }
    throw err;
  }
  revalidate();
  return { ok: true as const };
}
```

A rename is not month-scoped, so it commits immediately rather than waiting for "Save plan".

- [ ] **Step 4: Run the tests to green**

Run: `npx vitest run src/lib/db/queries/categories.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Pass archived categories to the page**

In `src/app/plan/page.tsx`, alongside `getActiveCategories()`:

```ts
import { getAllCategories } from "@/lib/db/queries/categories";
// …
const archivedCategories = getAllCategories().filter((c) => c.archivedAt);
```

and pass `archivedCategories={archivedCategories}` to `PlanClient`, adding `archivedCategories: Category[]` to its props type alongside the existing `categories: Category[]`.

- [ ] **Step 6: Add row actions**

In each budget-line row of `plan-client.tsx`, the existing single "Remove" cell becomes three controls: **Rename** (an inline input, same shape as `InlineRename` in Task 4, calling `renameCategory`), **Archive** (calls `archiveCategory`, then `router.refresh()`), and **Remove** (unchanged — drops the draft only). New-category drafts show only Remove; there is nothing on the server to rename or archive yet.

Archive must warn when the line has unsaved edits, since `router.refresh()` will re-read the server state:

```tsx
<button
  onClick={() => {
    if (dirty && !confirm("Archiving reloads the plan and discards unsaved amounts. Continue?")) return;
    startTransition(async () => { await archiveCategory(draft.categoryId); router.refresh(); });
  }}
  style={{ all: "unset", fontSize: 12, color: "var(--i40)", cursor: "pointer" }}
>
  Archive
</button>
```

Archiving does not remove the budget line — that is a separate, explicit act via Remove.

- [ ] **Step 7: Add the archived section**

At the foot of the page, below the summary grid:

```tsx
{archivedCategories.length > 0 && (
  <details style={{ marginTop: 32 }}>
    <summary className="section-label" style={{ cursor: "pointer" }}>
      Archived categories ({archivedCategories.length})
    </summary>
    <table style={{ marginTop: 12 }}>
      <tbody>
        {archivedCategories.map((cat) => (
          <tr key={cat.id} style={{ opacity: 0.6 }}>
            <td style={{ fontSize: 14 }}>{cat.name}</td>
            <td style={{ width: 80 }}><span className={`badge badge-${cat.kind}`}>{cat.kind}</span></td>
            <td style={{ width: 120 }}>
              <button
                onClick={() => startTransition(async () => { await restoreCategory(cat.id); router.refresh(); })}
                style={{ all: "unset", fontSize: 12, color: "var(--sig-ok)", cursor: "pointer" }}
              >
                Restore
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </details>
)}
```

- [ ] **Step 8: Verify by hand**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all tests pass.

In the browser: rename a category and confirm it changes on `/month` and `/capture` too; archive one and confirm it leaves Capture's picker but its past transactions still show on `/month`; restore it from the archived section and confirm it comes back. Rename a category to a name that already exists and confirm the inline error.

- [ ] **Step 9: Commit**

```bash
git add src/lib/db/queries/categories.ts src/lib/db/queries/categories.test.ts src/lib/actions/categories.ts src/app/plan/page.tsx src/components/plan/plan-client.tsx
git commit -m "feat: rename, archive and restore categories from the Plan tab"
```

---

### Task 7: Documentation and the full sweep

**Files:**
- Modify: `/Users/bramdecoster/Documents/Personal/personal_budget/CLAUDE.md` (glossary + invariants)
- Modify: `budget-app/docs/specs/2026-08-17-category-groups.md` (status line)

- [ ] **Step 1: Update the glossary**

In `CLAUDE.md`, replace the **Block** entry with:

```markdown
- **Group** — a user-defined presentation group for categories (`Living expenses`,
  `Subscriptions`, …). Cosmetic grouping only; never used in calculations. Groups are
  archived, never deleted, and a group cannot be archived while active categories point at it.
```

In the same file, add to Conventions:

```markdown
- Schema changes are numbered migrations in `src/lib/db/migrate.ts`, applied against
  `PRAGMA user_version`. Forward-only — never edit a migration that has already run.
```

- [ ] **Step 2: Mark the spec implemented**

Change the spec's `Status:` line to `implemented 2026-08-17` (use the real date at execution time).

- [ ] **Step 3: Full verification sweep**

```bash
npx tsc --noEmit
npm test
node verify-capture-order.js
node verify-month-persist.js
grep -rn "block" src --include=*.ts --include=*.tsx | grep -vi "display: \"block\"\|block-start\|block-end"
```

Expected: tsc clean; all unit tests pass; both verify scripts report `all checks passed`; the grep returns nothing.

Then confirm the database survived, comparing against the backup taken in Task 1:

```bash
node -e "const D=require('better-sqlite3');const a=new D('/tmp/budget-pre-migration.db',{readonly:true});const b=new D('data/budget.db',{readonly:true});for (const t of ['categories','transactions','budget_lines','merchant_rules','months']) console.log(t, a.prepare('SELECT COUNT(*) n FROM '+t).get().n, '→', b.prepare('SELECT COUNT(*) n FROM '+t).get().n)"
```

Expected: category, transaction, budget line, merchant rule and month counts identical on both sides, except where the run itself added rows.

- [ ] **Step 4: Commit**

```bash
git add ../CLAUDE.md docs/specs/2026-08-17-category-groups.md
git commit -m "docs: groups replace blocks in the glossary"
```

---

## Notes for the executor

- **Do not run `npm run dev`.** A dev server is already running on port 3000 from the user's own session; a second one picks port 3001 and the verify scripts, which hardcode 3000, will then test the wrong process.
- **The database is live data**, not a fixture: 19 categories, 27 manually entered transactions. Take the backup in Task 1 Step 14 before the first request that triggers migration 001.
- Two known defects are **out of scope** and must not be fixed here: `/month` defaulting to the newest month rather than the current one, and ⌘Z inside a text field deleting the last saved transaction.
- Three uncommitted changes are in the working tree from earlier work (capture field order, the Month `Spent` tile, sidebar month persistence) plus `verify-capture-order.js` and `verify-month-persist.js`. Leave them alone; do not fold them into these commits.
