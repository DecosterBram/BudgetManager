# CLAUDE.md — Budget app

Context file for Claude Code. Read this before touching anything in the repo.

---

## What this is

A single-user personal finance tracker that replaces a 13-sheet Excel workbook
(`Personal_Finances.xlsx`, Oct 2025 – Jul 2026, ~390 transactions).

**The laptop is the primary surface.** It runs locally in a desktop browser, and the app is
built keyboard-first — the same way the spreadsheet it replaces was used. Phone access is a
later convenience for capture away from the desk, not the design centre. Anything that
sacrifices desktop speed for touch ergonomics is the wrong trade.

It is **not** a general-purpose budgeting SaaS. One user, one currency (EUR), one
household. Every decision should favour "correct and fast for this one person" over
"flexible for hypothetical users".

## Why it exists — what Excel got right and wrong

The Excel model is a **two-layer envelope budget**, and that model is deliberately kept:

- **Plan layer** — budget lines grouped in four blocks (Living, Subscriptions, Regular,
  Miscellaneous). Each line has a planned amount and a `Need` / `Want` / `Save` tag,
  checked against a percentage split of income (currently 50 / 25 / 25).
- **Actual layer** — a flat transaction log. Joined to the plan layer by category name,
  giving planned-vs-actual per line.

What failed in Excel, in priority order — these are the problems the app must solve:

1. **Capture friction.** ~45 transactions a month typed by hand. The date field was
   abandoned entirely after Jan 2026 (Nov and Dec are fully dated, Jan is 16 of 41,
   Feb onward is zero). Any design that makes entry slower than the spreadsheet has failed.
2. **No cross-month view.** Ten months of clean data, each month an island, zero aggregates.
3. **Category drift.** 24 distinct categories, no two months using the same set. There was
   no stable dimension, so comparison across months is impossible without hand-mapping.
4. **Formula rot.** Every new month was a sheet copy. The template's `SUMIF`s point at an
   empty range, its category list is stale, and Excel renamed every table on copy
   (`Table19152127333945515763`). Copy-paste inheritance is the root cause; the app removes it.
5. **Invisible splits.** Shared costs were encoded inside formulas (`=84/2`, `=116.34/6`,
   `=61.29-14.35-14.35-15.35`). The arithmetic was right but the claim on the other person
   vanished. Deferred to v2, but the schema must not make it painful later.

## Non-goals

- No bank connection, PSD2 aggregator, or CSV import in v1. Entry is manual by choice.
- No multi-user accounts, no sharing, no roles.
- No investment/portfolio tracking, no net-worth statement.
- No mobile-native app, and no mobile-first design. A responsive PWA is the phone story,
  and it comes late.
- No cloud dependency in the core loop. The app must work fully offline.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router), TypeScript strict | One process serving UI + API; the same artifact runs on localhost today and on a home server later |
| DB | SQLite (`better-sqlite3`) via Drizzle ORM | Single file, trivially backed up, zero ops. ~400 rows/year — Postgres would be theatre |
| UI | Tailwind + shadcn/ui, Radix primitives | Design-lab mockups map to components directly |
| Charts | Recharts | Sufficient for the trend views |
| Validation | Zod, shared between form and API | |
| Tests | Vitest (unit), Playwright (capture flow only) | |
| Packaging | One Dockerfile, `docker compose up` | Upgrade path to phone access is "run the same container elsewhere" |

Runs at `localhost:3000`. No auth in v1 — auth lands in the same phase as remote access,
never before.

## Domain glossary

Use these names in code, DB, and UI. Do not invent synonyms.

- **Transaction** — one real money movement. Has a date, description, amount, category.
- **Category** — stable dimension (`Groceries`, `Rent`, `Fun`, …). Has a `kind` of
  `need` | `want` | `save`. Categories are **archived, never deleted** — history depends on them.
- **Budget line** — a planned amount for one category in one month.
- **Block** — the four presentation groups: `living`, `subscriptions`, `regular`, `misc`.
  Cosmetic grouping only; never used in calculations.
- **Allocation** — the Need/Want/Save percentage split for a month. Default 50/25/25.
- **Spendable income** — actual income minus the `save` allocation.
- **Merchant rule** — a learned mapping from a normalised description to a category.
- **Pace** — spend-to-date compared to the linear expectation for the day of month.

## Invariants

These are non-negotiable. Break one and the app silently lies.

1. **Money is integer cents.** `amount_cents INTEGER NOT NULL`. Never a float, anywhere,
   including intermediate calculations. Format only at the render edge.
2. **Every transaction has a date.** Never optional, never nullable. Default to today,
   prefilled, editable without leaving the keyboard. Never a blocking step — this is exactly
   the field the spreadsheet lost. Imported rows without a date get the month's first day
   plus `date_precision = 'month'`, and every view that aggregates by day must exclude
   or clearly mark them.
3. **A transaction always has a category.** Uncategorised is not a state; there is an
   explicit `Other` category instead.
4. **Categories are referenced by id, never by name.** The name-string join is exactly
   what rotted in Excel.
5. **Budget lines are data, not copies.** A new month is generated from the previous month's
   lines by a function, not duplicated by hand.
6. **Timezone is `Europe/Brussels`.** Dates are stored as `YYYY-MM-DD` text, not timestamps.
   "What month is this transaction in" must never depend on UTC.
7. **The core loop works offline.** LLM categorisation is optional, flagged off by default,
   and never blocks a save.

## Conventions

- Keyboard is a first-class input, not an accessibility afterthought. Every primary action has
  a shortcut, tab order follows visual order, and the capture flow must be completable without
  the mouse ever being touched.
- Server Components by default; `'use client'` only where interaction demands it.
- All DB access goes through `lib/db/queries/*`. No inline SQL in components or routes.
- Every mutation is a Server Action returning a typed result, validated with the same Zod
  schema the form uses.
- Dates: `YYYY-MM-DD` strings end to end. Months: `YYYY-MM`.
- Display formatting is Belgian: `€ 1.234,56`, weeks start Monday. Interface language is English.
- Migrations are checked in and forward-only. Never edit an applied migration.
- Seed and import scripts live in `scripts/` and are idempotent — running twice must not
  double-insert.

## Testing bar

- Unit tests for anything that computes money: totals, allocations, remaining budget, pace.
- One Playwright test for the capture flow, asserting the round trip in under 5 seconds.
- A reconciliation test: importing the Excel history must reproduce each month's
  `Total Spend` to the cent.

## Working style

- Small, reviewable commits. One phase from `plan.md` at a time.
- When a phase's acceptance criteria are met, stop and say so rather than continuing.
- If a requirement here conflicts with something in `plan.md`, this file wins — flag the
  conflict instead of quietly picking one.
- Prefer deleting code over adding a flag.
