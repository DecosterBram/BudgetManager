# Plan page and Settings — making the buttons real

Date: 2026-08-11
Status: agreed, not yet implemented

## Problem

The Plan and Settings pages were built as design-lab mockups and only partially wired to the
database. What looks like a working screen is in several places static markup.

Confirmed defects, with their causes:

| Symptom | Cause |
|---|---|
| "+ Add line" does nothing | `<button>` with no `onClick` — [plan-client.tsx:246](../../src/components/plan/plan-client.tsx) |
| "Remove" does nothing | same, [plan-client.tsx:238](../../src/components/plan/plan-client.tsx) |
| "Generate next month" does nothing | same, [plan-client.tsx:128](../../src/components/plan/plan-client.tsx) |
| Planned amounts are lost on save | inputs are uncontrolled `defaultValue` with no state; `savePlan` writes only the `months` row and never touches `budget_lines`. `upsertBudgetLine` exists in `queries/months.ts` but has no callers |
| "+ New category" / "Archive" / "Restore" do nothing | `settings/page.tsx` is a client component rendering the `CATEGORIES` mock from `lib/mock-data.ts`. There are no category server actions at all |
| Merchant rule "Delete" does nothing | same page, `MERCHANT_RULES` is a hardcoded array |
| The sidebar month dropdown seems absent, and has no effect on Plan | it exists under "Budget" but is styled with no border, background or chevron, so it reads as caption text; and `plan/page.tsx` ignores the `?month=` it sets |

There is also a structural blocker behind "Generate next month": the plan page is pinned to
`const CURRENT_MONTH = "2026-08"`. Even a fully wired Generate button would create September
and then have no way to display it.

## Decisions

Taken during brainstorming, recorded so the reasoning survives:

1. **Generation is ad-hoc, not a month-close ritual.** You plan September whenever you feel
   like it. Consequence: `months.closed_at` has no job. It is nevertheless *left in place* —
   `migrate.ts` is `CREATE TABLE IF NOT EXISTS` with no migration framework, so removing a
   column means hand-altering the live database to delete an unused nullable field. Revisit
   if a real migration path appears.
2. **No preview-and-confirm step.** plan.md asks for "an obvious diff before confirming", but
   that was written before the plan page existed as an inline editor. Generate copies the
   planned amounts and lands you on the new month; the plan page *is* the review step.
   Planned amounts stay mostly constant month to month, and the two or three that drift get
   edited later, not at generation time.
3. **Removing a budget line with spend against it is allowed.** The `budget_lines` row is
   deleted; transactions are never touched. The spend then surfaces as unplanned, which
   plan.md already calls for. Blocking removal would keep plan and actual in lockstep at the
   cost of getting in the way of a genuine mis-plan.
4. **New categories are created in Settings only.** The plan page's "+ Add line" picks from
   existing categories. Two creation paths on two pages is worse than one context switch.

## Design

### A. Month selection — one global control

The month picker is a single global dropdown in the sidebar, directly under the word
"Budget". **It already exists** — `MonthPickerClient` in
[sidebar.tsx](../../src/components/layout/sidebar.tsx), fed by `getAvailableMonths()` from
the root layout, writing `?month=` onto the current path. It is not discovered because of two
separate faults:

1. **It doesn't look like a control.** `appearance: none`, no border, no background, no
   chevron, 11px in `var(--i40)` — visually identical to the caption text it sits in.
2. **It has no effect on `/plan`.** The picker sets `?month=` correctly, but
   `app/plan/page.tsx` ignores `searchParams` and reads a hardcoded constant, so changing the
   month there does nothing observable.

The fix is to repair the existing control, not to add a second one:

- `app/plan/page.tsx` takes `searchParams: Promise<{ month?: string }>` and resolves the month
  the way `app/month/page.tsx` already does: validate against `/^\d{4}-\d{2}$/`, else fall
  back to the newest month from `getAvailableMonths()`. The hardcoded constant is deleted.
- `MonthPickerClient` gains visible affordance: a chevron, a hover/focus background, and a
  hit area that reads as clickable. It stays compact and in place — the position is right,
  only the legibility is wrong.
- The `availableMonths.length <= 1` branch that degrades to plain text is kept, since with a
  single month there is nothing to pick.
- `components/month/month-selector.tsx` is deleted. It is a second, near-identical selector
  that nothing imports.

Because the picker lives in the layout and every page reads the same `?month=` param, the
selected month persists across navigation between Month, Plan and Trends.

### B. Planned amounts persist

`PlanClient` holds the lines in state:

```ts
type LineDraft = { categoryId: number; raw: string };
```

seeded from props, `raw` being the Belgian-formatted text the input displays. Cents come from
`parseAmount(raw) ?? 0`.

All derived figures — block totals, `needPlanned` / `wantPlanned` / `savePlanned`,
`totalPlanned`, `unallocated` — compute from this state rather than from props. Today they
read the props, so the summary tiles sit stale while you type; since hitting the allocation
is the reason the page exists, they must track the inputs live.

`savePlan` grows a `lines` field:

```ts
{
  month: string,                    // YYYY-MM
  incomeProjectedCents: number,
  pctNeed: number, pctWant: number, pctSave: number,
  lines: { categoryId: number, plannedCents: number }[]
}
```

validated by the existing Zod schema, extended. The server does, in **one** SQLite
transaction:

1. upsert the `months` row (unchanged behaviour),
2. `upsertBudgetLine` for every line in the payload,
3. delete every `budget_lines` row for that month whose `categoryId` is absent from the
   payload.

The client always sends the complete set for the month, so step 3 is what makes "Remove"
persist. Add, edit and remove therefore all commit through a single action — no mix of
staged and immediate writes.

### C. Add and remove lines

**Add line.** The per-block button reveals a `<select>` listing active categories whose
`block` matches and which have no line in this month yet. Choosing one appends the row with
an empty amount and moves focus to its input. When a block has no eligible categories left,
the button is disabled.

**Remove.** Filters the draft out of state. Persisted by the delete step in B.

### D. Generate next month

New server action `generateNextMonth(sourceMonth: string)`. In one transaction:

- compute `next = nextMonth(sourceMonth)`,
- insert the `months` row copying `incomeProjectedCents`, `pctNeed`, `pctWant`, `pctSave`
  from the source,
- insert a `budget_lines` row per source line whose category is **not archived**, carrying
  `plannedCents` across unchanged.

Then `revalidatePath("/plan")` and the client navigates to `/plan?month=<next>`.

Month arithmetic is pure string math, no `Date` object, per invariant 6:

```ts
export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
```

Button states:

| Condition | Control |
|---|---|
| next month has no `months` row | **"Generate September"**, runs the action |
| next month exists | **"Go to September →"**, a plain link |
| unsaved edits present | disabled, titled "Save your changes first" |

The third case matters: generate copies what is in the database, so running it over unsaved
edits would silently propagate stale numbers.

`incomeActualCents` on the generated month is set equal to the copied projected income. This
matches the existing simplification in `savePlan` ("treat projected = actual"). Leaving it at
zero would instead make the new month's month-view report € 0 spendable. When real actual-income
tracking arrives, both places change together.

### E. Settings on real data

`app/settings/page.tsx` becomes a server component: `ensureDb()`, `getAllCategories()`,
`getMerchantRules()`, rendering a new `components/settings/settings-client.tsx` that holds the
current JSX minus the mock imports.

New `lib/actions/categories.ts`:

- `createCategory({ name, kind, block })` — `sortOrder` = current max + 1. A duplicate name
  hits the existing `UNIQUE` constraint on `categories.name`; the action catches it and
  returns a typed error rendered inline rather than throwing.
- `archiveCategory(id)` — sets `archived_at = today()`. Never deletes; history depends on
  the row.
- `restoreCategory(id)` — clears `archived_at`.

Supporting queries in `lib/db/queries/categories.ts`: `insertCategory`, `setCategoryArchived`,
`maxSortOrder`.

"+ New category" is an inline row — name input, kind select, block select, Add — not a
dialog. Keyboard-first, consistent with the rest of the app.

### F. Merchant rules tab

Reads real rows via the existing `getMerchantRules()`. Adds `deleteMerchantRule(id)` as a
query and an action behind the Delete button.

While here, one defect in `upsertMerchantRule` ([queries/categories.ts:43](../../src/lib/db/queries/categories.ts))
is fixed: the conflict branch sets `hitCount: db.$count(merchantRules)`, which writes the
*total number of rules* instead of incrementing that rule's count. It should be a raw
`hit_count + 1` SQL expression. Left alone, rule ranking degrades as the rule set grows.

## Testing

Vitest is added as a devDependency with a minimal config — the stack in CLAUDE.md names it
but nothing was installed and no tests exist.

Unit tests, covering the money and date paths per the testing bar:

- `nextMonth` — mid-year, and the December → January rollover.
- Plan totals derived from edited state: need/want/save planned, `totalPlanned`,
  `unallocated`, including a negative (over-allocated) case.
- `savePlan`'s line reconciliation: a line edited, a line added and a line removed in one
  payload produce exactly the expected `budget_lines` rows.
- `generateNextMonth`: copies planned amounts to the correct month, skips archived
  categories, and copies the income and percentage fields.

This requires extracting the plan totals from the component into a pure function
(`lib/plan-totals.ts`) so they can be tested without rendering.

## Out of scope

- **Savings goals.** Still renders the `GOALS` mock; there is no `savings_goals` table. It is
  Phase 4 in plan.md and stays there.
- **Excel import (Phase 0).** Has never been run — the database holds 19 categories, 2 seeded
  months (2026-07, 2026-08) and 27 transactions, not the ten months and ~390 transactions
  plan.md describes. The reconciliation gate has therefore never been exercised. Flagged
  because plan.md gates later phases on it, but it is not part of this change.

## Notes

- `data/budget.db` is untracked and not in `.gitignore`. Adding `/data` to `.gitignore` is
  advisable before anything in this repo is committed broadly.
