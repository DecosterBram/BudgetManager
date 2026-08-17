# Category groups, and category creation moves to Plan

Date: 2026-08-17
Status: agreed, not yet implemented

## Problem

Budgeting for something new costs five steps across two screens: Settings → Categories →
"+ New category" (name, kind, block) → back to Plan → "+ Add line" → pick it from the select.
The Plan page is where you decide to spend money on something; it is the wrong place to
discover you cannot.

Underneath that sits a second limit. A category's group is a fixed enum of four values —
`living`, `subscriptions`, `regular`, `misc` — declared in seven places:

| Where | What |
|---|---|
| [schema.ts:7](../../src/lib/db/schema.ts) | Drizzle column enum |
| [migrate.ts:18](../../src/lib/db/migrate.ts) | SQL `CHECK (block IN (…))` |
| [types.ts:2](../../src/lib/types.ts) | `export type Block` |
| [actions/categories.ts:16](../../src/lib/actions/categories.ts) | Zod enum |
| [queries/categories.ts:57](../../src/lib/db/queries/categories.ts) | return type |
| [plan-client.tsx:9](../../src/components/plan/plan-client.tsx), [month/page.tsx:11](../../src/app/month/page.tsx), [settings-client.tsx:13](../../src/components/settings/settings-client.tsx), [transaction-list.tsx:21](../../src/components/month/transaction-list.tsx), [capture-form.tsx:381](../../src/components/capture/capture-form.tsx) | five hardcoded `BLOCKS` lists |

There is no way to add a fifth group, and the four names are not yours — they came from the
Excel workbook's layout.

## Decisions

Taken during brainstorming on 2026-08-17, recorded so the reasoning survives:

1. **Groups become data.** A `category_groups` table with add, rename, reorder and archive.
   Not four renameable slots — a fifth group has to be possible.
2. **Categories are created from the Plan tab, and written only when the plan is saved.**
   A new category exists as a draft alongside its planned amount; "Save plan" commits both in
   one transaction. Abandoning the page leaves nothing behind. The cost is that a new category
   is invisible to Capture until the plan is saved, which is acceptable because you are on the
   Plan page precisely to finish planning.
3. **This supersedes decision 4 of [2026-08-11](2026-08-11-plan-and-settings-fixes.md)** —
   "new categories are created in Settings only… two creation paths on two pages is worse than
   one context switch". There is still exactly one creation path; it has moved to where the
   need arises.
4. **Settings' Categories tab is replaced by a Groups tab.** All category management —
   create, rename, archive, restore — moves to Plan. Settings keeps Merchant rules and Danger.
5. **Archiving a group is refused while active categories still point at it**, naming the
   offenders. Nothing is silently reshuffled, and no category can be orphaned.
6. **Groups are archived, never deleted**, exactly as categories are. History depends on them.
7. **The concept is renamed Block → Group in DB, code and UI**, and `CLAUDE.md`'s glossary
   entry is updated in the same commit. See *Conflicts with CLAUDE.md* below.
8. **Migrations get a version counter** (`PRAGMA user_version`). Dropping a `CHECK`
   constraint in SQLite requires a table rebuild, which the current
   `CREATE TABLE IF NOT EXISTS` startup script cannot express.

## Design

### A. Data model

```sql
CREATE TABLE category_groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT
);
```

`categories.block TEXT CHECK(…)` becomes:

```sql
group_id INTEGER NOT NULL REFERENCES category_groups(id)
```

Groups stay presentational. Nothing in the money math reads `group_id` — allocation, pace and
remaining are computed from `categories.kind` alone — so invariant "block is cosmetic
grouping only, never used in calculations" survives the change intact.

Naming through the stack: table `category_groups`, column `group_id`, TypeScript `Group` /
`groupId`, UI label "Group". The bare name `groups` is avoided as a table name because SQLite
treats `GROUPS` as a window-frame keyword.

### B. Migration mechanism

`migrate.ts` gains a numbered list of steps run against `PRAGMA user_version`:

```ts
const MIGRATIONS: ((db: Database) => void)[] = [
  migration001CategoryGroups,   // index 0 takes user_version 0 → 1
];
```

`migrateAndSeed()` keeps its current shape — DDL for a fresh database, then seed — and then
applies every migration whose index is `>= user_version`, bumping the pragma after each. A
fresh database created by the new DDL is stamped at the current version and skips them all.
Forward-only, checked in, no new tooling in the dev loop.

### C. Migration 001 — blocks become groups

SQLite cannot drop a `CHECK` constraint, so `categories` is rebuilt using the standard
procedure. `PRAGMA foreign_keys` cannot be changed inside a transaction, so it is toggled
around it:

```sql
PRAGMA foreign_keys = OFF;
BEGIN;

CREATE TABLE category_groups (…);
INSERT INTO category_groups (name, sort_order) VALUES
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

COMMIT;
PRAGMA foreign_keys = ON;
```

The display names are the ones Plan and Month already render, not the lowercase keys Settings
shows today. Ids are preserved, so `transactions`, `budget_lines` and `merchant_rules` keep
pointing at the same categories. After the rebuild the migration asserts
`PRAGMA foreign_key_check` returns no rows and that the category count is unchanged; either
failing aborts before the version is bumped.

The seed path in `migrate.ts` changes correspondingly: it inserts the four groups first and
seeds categories with `group_id`.

### D. Plan tab — creating a category

The per-group "+ Add line" select gains a first option, **＋ New category…**, which turns the
row into an inline editor: name field, need/want/save picker, Add. Keyboard-first and
consistent with the existing inline forms — no dialog.

`Draft` becomes a discriminated union:

```ts
type Draft =
  | { kind: "existing"; categoryId: number; raw: string }
  | { kind: "new"; tempId: string; name: string; catKind: PlanKind; groupId: number; raw: string };
```

`tempId` keys React lists and drives removal; it never reaches the database. Everything
downstream that reads `catInfo` resolves a new draft from its own fields instead of the
category map, so group totals and the need/want/save summary include unsaved categories live.

`savePlan`'s payload grows one variant:

```ts
lines: (
  | { categoryId: number; plannedCents: number }
  | { newCategory: { name: string; kind: PlanKind; groupId: number }; plannedCents: number }
)[]
```

The action, in **one** transaction: create each new category (`sort_order` = current max in
that group + 1), then run the existing upsert-and-reconcile over the full line set with the
newly minted ids substituted in. Any failure rolls the whole thing back — no orphan category
without its line, no line without its category.

Rejections, all surfaced inline against the offending row rather than thrown:

| Case | Behaviour |
|---|---|
| Name matches an existing active category | "Groceries already exists — add it as a line instead" |
| Name matches an **archived** category | "Groceries exists but is archived — restore it below" (`categories.name` is `UNIQUE`, archived rows included) |
| Two new drafts share a name | caught client-side before the action runs |
| Blank name, or a kind not in need/want/save | Add button stays disabled |
| `groupId` missing or archived | rejected by Zod against the live group list |

Removing a line whose draft is new simply drops the draft; nothing was written.

### E. Plan tab — rename, archive, restore

With Settings' Categories tab gone, Plan absorbs the rest of category management:

- Each line row gets **Rename** (inline edit of the category name, saved immediately via a
  `renameCategory` action — a name is not month-scoped, so deferring it to "Save plan" would
  be surprising) and **Archive**.
- Archiving does **not** touch budget lines or transactions. The category disappears from
  Capture's picker and from future generated months, per `generateMonthFrom`'s existing
  `isNull(categories.archivedAt)` filter. Removing the line is a separate, explicit act.
- A collapsed **Archived categories (n)** section at the foot of the page lists archived
  categories with **Restore**, mirroring what Settings does today.

This is the part of the change that makes Plan busier rather than simpler, and the part most
likely to need a second pass once it is in use.

### F. Settings — the Groups tab

Replaces Categories. A single table: name, category count, reorder (▲▼ buttons — keyboard
reachable, unlike drag and drop), rename, archive. Below it, an "+ New group" inline row
(name only; sort order = max + 1).

Archive is refused while the group holds active categories, and says which:
*"Regular expenses still holds 7 categories — move them first."* Archived groups are hidden
from every picker but remain valid FK targets for the archived categories inside them.

New actions in `lib/actions/groups.ts`: `createGroup`, `renameGroup`, `reorderGroup`,
`archiveGroup`, `restoreGroup`. New queries in `lib/db/queries/groups.ts`: `getActiveGroups`,
`getAllGroupsWithCounts`, `insertGroup`, `setGroupArchived`, `updateGroupSortOrder`.

### G. Everywhere else

The five hardcoded `BLOCKS` arrays are deleted. Groups arrive as data:

| Screen | Change |
|---|---|
| `app/plan/page.tsx`, `app/month/page.tsx`, `app/settings/page.tsx` | server components query `getActiveGroups()` and pass it down |
| `app/capture/page.tsx` | same, passed into `CaptureForm` for the picker's grouping |
| `plan-client.tsx`, `month/transaction-list.tsx`, `capture-form.tsx`, `settings-client.tsx` | iterate the `groups` prop instead of a constant |
| `queries/months.ts`, `queries/transactions.ts` | `categoryBlock` becomes `categoryGroupId` + `categoryGroupName` via a join on `category_groups` |
| `types.ts` | `type Block` deleted; `type Group = { id; name; sortOrder; archivedAt }` added |
| `lib/mock-data.ts` | the `CATEGORIES` array carries stale `block` values and nothing imports it — delete it. `GOALS` stays; the Goals page still renders it until Phase 4 |

## Testing

Per the testing bar — anything touching money or the schema gets a unit test.

**Migration (new `migrate.test.ts`, against a temp DB via `BUDGET_DB_PATH`):**

- Build a v0 database with the old `block` column and representative rows; run
  `migrateAndSeed()`; assert every category survives with its name, kind, sort order and
  archived state, and lands in the group its old block maps to.
- `PRAGMA foreign_key_check` returns no rows; `budget_lines` and `transactions` still join to
  their categories.
- `user_version` is 1, and a second run is a no-op (idempotent, per the seed-script rule).

**Actions:**

- `savePlan` with one existing line edited, one new category added and one line removed
  produces exactly the expected `categories` and `budget_lines` rows.
- `savePlan` with a duplicate new-category name writes **nothing** — the pre-existing lines
  are unchanged, proving the rollback.
- `archiveGroup` is refused while an active category points at the group, and succeeds once
  the last one moves away.
- `renameCategory` rejects a name that collides, including with an archived category.

**Regression:** the existing 23 unit tests stay green; `verify-capture-order.js` and
`verify-month-persist.js` are re-run, since Capture's category picker changes its grouping
source and Plan changes shape.

## Out of scope

- Reordering categories *within* a group. `sort_order` keeps its current meaning and no UI is
  added for it.
- Per-month groups, group colours, group-level budget targets.
- Drag-and-drop anywhere.
- The two open defects from 2026-08-17 — `/month` defaulting to the newest month rather than
  the current one, and ⌘Z inside a text field deleting the last saved transaction. Both are
  unrelated to this change and still outstanding.

## Conflicts with CLAUDE.md

Flagged rather than quietly resolved, per that file's own rule:

1. **Glossary.** "**Block** — the four presentation groups: `living`, `subscriptions`,
   `regular`, `misc`" no longer holds. The entry is rewritten as "**Group** — a user-defined
   presentation group for categories. Cosmetic grouping only; never used in calculations.
   Groups are archived, never deleted." The "use these names in code, DB and UI, do not invent
   synonyms" rule is what forces the rename to reach all three layers rather than relabelling
   only the UI.
2. **"Prefer deleting code over adding a flag."** Respected: five constants, one type and one
   Zod enum are deleted, and the migration counter replaces nothing that exists.
