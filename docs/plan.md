# plan.md — Build plan

Read `claude.md` first for context, glossary and invariants.

Sequencing principle: **the app must be usable before it is impressive.** Phases 0–2 replace
Excel. Everything after that is upside. Do not start a phase before the previous one's
acceptance criteria pass.

---

## Phase 0 — Foundations and migration

Goal: schema in place, ten months of history imported, merchant rules bootstrapped.

### Schema

```sql
CREATE TABLE categories (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  kind          TEXT NOT NULL CHECK (kind IN ('need','want','save')),
  block         TEXT NOT NULL CHECK (block IN ('living','subscriptions','regular','misc')),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  archived_at   TEXT
);

CREATE TABLE transactions (
  id             INTEGER PRIMARY KEY,
  occurred_on    TEXT NOT NULL,                    -- YYYY-MM-DD
  date_precision TEXT NOT NULL DEFAULT 'day'
                 CHECK (date_precision IN ('day','month')),
  description    TEXT NOT NULL,
  amount_cents   INTEGER NOT NULL,                 -- >0 expense, <0 refund
  category_id    INTEGER NOT NULL REFERENCES categories(id),
  kind           TEXT NOT NULL DEFAULT 'expense'
                 CHECK (kind IN ('expense','income')),
  note           TEXT,
  entry_source   TEXT NOT NULL DEFAULT 'manual'
                 CHECK (entry_source IN ('manual','import')),
  created_at     TEXT NOT NULL
);
CREATE INDEX ix_tx_month ON transactions(substr(occurred_on,1,7));
CREATE INDEX ix_tx_category ON transactions(category_id);

CREATE TABLE budget_lines (
  id            INTEGER PRIMARY KEY,
  month         TEXT NOT NULL,                     -- YYYY-MM
  category_id   INTEGER NOT NULL REFERENCES categories(id),
  planned_cents INTEGER NOT NULL,
  UNIQUE (month, category_id)
);

CREATE TABLE months (
  month            TEXT PRIMARY KEY,               -- YYYY-MM
  income_projected_cents INTEGER NOT NULL DEFAULT 0,
  income_actual_cents    INTEGER NOT NULL DEFAULT 0,
  pct_need         REAL NOT NULL DEFAULT 0.50,
  pct_want         REAL NOT NULL DEFAULT 0.25,
  pct_save         REAL NOT NULL DEFAULT 0.25,
  closed_at        TEXT
);

CREATE TABLE merchant_rules (
  id            INTEGER PRIMARY KEY,
  pattern       TEXT NOT NULL UNIQUE,              -- normalised description
  category_id   INTEGER NOT NULL REFERENCES categories(id),
  hit_count     INTEGER NOT NULL DEFAULT 1,
  last_used_on  TEXT NOT NULL
);

CREATE TABLE savings_goals (                       -- Phase 4
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  target_cents   INTEGER NOT NULL,
  saved_cents    INTEGER NOT NULL DEFAULT 0,
  priority       TEXT NOT NULL CHECK (priority IN ('high','medium','low')),
  target_date    TEXT,
  achieved_at    TEXT
);
```

Deferred to Phase 6 but reserved now so the shape is known:
`split_groups`, `split_shares (transaction_id, person, share_cents, settled_at)`.
Do not create the tables yet — just don't design anything that would make them awkward.

### Importer — `scripts/import-excel.ts`

Source: `Personal_Finances.xlsx`. Sheets `Oct25`, `Nov25`, `Dec2025`, `Jan2026` … `Jul2026`.
Ignore `Template sheet` (its formulas are broken) and `Holiday booking` (Phase 6 material).

Per month sheet:

- Budget lines: rows 20–27 and 29–36, columns `B/C/D` (Living, Regular) and `H/I/J`
  (Subscriptions, Misc) → name / planned amount / kind. Blank name means empty slot, skip.
  A few cells hold formulas rather than literals (`=84/2`, `=116.34/6`) — read cached values,
  not formula strings.
- Income: `C4` projected, `D4` actual. Percentages from `I4:I6` (Oct25 is 50/20/30, the rest 50/25/25).
- Transactions: block starting under the `Expenses / Amount / Category / Date` header at
  row 51 — columns `C` (description), `E` (amount), `G` (category), `I` (date) — down to the
  `Total Spend` row.
- Dates: present in Nov25, Dec2025 and 16 of 41 rows in Jan2026. Everything else gets the
  first of the month with `date_precision = 'month'`.

Category unification is the real work. Build one canonical list from all months, mapping
month-specific variants onto it, and assign each a `kind` and `block` from its most recent
appearance. Categories that only ever appear in one month (`Christmas`, `Housewarming`,
`Furniture`, `Golf`, `Netflix`) are imported and immediately archived — they must exist for
history to resolve, but must not clutter the picker.

**Reconciliation gate:** after import, each month's transaction sum must equal that sheet's
`Total Spend` to the cent, and each budget line's total must equal its `Spend` cell. Print a
table of month / expected / actual / delta. Do not proceed to Phase 1 with a non-zero delta.

### Bootstrap merchant rules

Every imported transaction is a labelled example (~390 of them, and they are clean —
every category in the log matches a budget line in every month). Normalise each description
and insert into `merchant_rules` with the most frequent category and a hit count. This means
day one of the app already recognises Aldi, Carrefour, AH, Delhaize, Jumbo, Lidl, Kapper,
Spotify, Internet, Rent and the rest.

**Acceptance:** `docker compose up` serves the app, the DB holds ten months, reconciliation
is zero on every month, and `merchant_rules` has entries for at least the 20 most frequent
descriptions.

---

## Phase 1 — The capture loop (priority 1)

Everything here serves one number: **time to enter a batch of transactions.** The realistic
session is not one entry — it is sitting down at the laptop with the banking app open and
entering eight of them in a row. Target under 5 seconds per transaction, keyboard only,
with the hands never leaving the home row.

### Flow

1. A global shortcut (`n`, or `⌘K`) opens capture from anywhere in the app; on load the app
   opens with it focused. Cursor starts in the amount field.
2. Type the amount. `Tab`.
3. Description field with type-ahead over past descriptions, ranked by
   `hit_count × recency`. Arrow keys move through suggestions; accepting one sets the
   category in the same keystroke.
4. Category is prefilled from the prediction. `Tab` reaches it and typing filters the list —
   it is only touched when the prediction is wrong.
5. Date is prefilled to today and accepts relative input (`-1`, `-2`, `28/7`). This is the
   field Excel lost; it must never block a save.
6. `Enter` saves. The form clears, stays open, and refocuses the amount field for the next
   entry. A compact confirmation with `⌘Z` undo appears in the running list beside the form.

The form does not close after saving, and there is no modal that must be dismissed and
reopened between entries — that alone is the difference between a 40-second batch and a
three-minute one.

### Batch-entry affordances

- The running list of entries saved in this session sits next to the form; the last row is
  editable in place without reopening anything.
- `⌘Z` undoes the last save.
- Duplicate detection: same amount, same description, same day already exists → a warning in
  the list, not a blocking dialog. Entering the same coffee twice is legitimate.

### Categorisation — `lib/categorise.ts`

Deterministic, local, no network:

1. Normalise: lowercase, strip accents, digits and punctuation, collapse whitespace.
   `AH 1274 Gent` → `ah`.
2. Exact match on `merchant_rules.pattern` → high confidence.
3. Token overlap and trigram similarity against known patterns → medium confidence above a
   tuned threshold.
4. No match → low confidence, no preselection, show the three most-used categories instead.

Confidence drives UI, not correctness: high preselects silently, medium preselects with a
visible marker, low preselects nothing. Every save upserts the rule and increments
`hit_count`, so a correction is learned immediately.

Optional, behind `ENABLE_LLM_CATEGORISATION=false`: on low confidence, call the Anthropic API
with the description and the fixed category list, cache the answer as a rule. It must be
fire-and-forget and must never delay a save.

### Also in this phase

- Transaction list for the current month, grouped by day, newest first.
- Edit and delete, with the same form.
- Quick-repeat: the most recent descriptions as one-keystroke templates.

**Acceptance:** a Playwright test enters five transactions using only keyboard events — no
mouse, no click — averaging under 5 seconds each. After a week of real use, at least 80% of
entries are saved without correcting the predicted category.

---

## Phase 2 — Month view (Excel parity)

This is the phase that lets the spreadsheet be retired, so it must reproduce every number
the Excel month sheet shows:

- Income projected / actual / difference
- Need / Want / Save split — projected, actual, difference
- Spendable income = actual income − save allocation
- Planned remaining budget = spendable income − total planned
- Actual remaining budget = spendable income − total spent
- Per budget line: planned, spent, difference, and a paid indicator
- Total planned, total spent, need total, want total

Plus what Excel could not do:

- **Rollover for a new month:** generate next month's budget lines from the current month's,
  with an obvious diff before confirming. This replaces sheet-copying, and with it the
  formula rot.
- Lines with spend but no plan are surfaced rather than silently missing.
- Undated imported rows are marked in the list, not hidden.

**Acceptance:** open the app and `Personal_Finances.xlsx` side by side for Jul2026; every
figure above matches. From this point, new months are entered only in the app.

---

## Phase 3 — Trends (priority 2)

The payoff for ten months of unified data.

- Total spend per month, with a rolling average line
- Need / Want / Save mix over time — the question the 50/25/25 rule exists to answer
- Per-category small multiples, sorted by variability, so the volatile categories surface first
- Top merchants by spend and by frequency
- Pace: spend-to-date this month against the same day in previous months
- Category detail: drill from any category into its transactions across all months

Guard every day-level chart against `date_precision = 'month'` rows — they will pile up on
the 1st and distort anything weekly. Aggregate them at month level only, and label the
affected range.

**Acceptance:** every chart renders from the imported history without manual data prep.

---

## Phase 4 — Savings goals and forecast (priority 3)

Replaces the abandoned `Saving dept` sheet, which never got past its headers.

- Goals with target amount, priority and optional target date
- Contributions linked to transactions in `save` categories, so the ledger stays single-source
- Projected completion from the trailing three-month average save rate
- A simple forecast: at the current rate, what the balance looks like in 3, 6 and 12 months
- Income model tolerates irregular amounts — do not assume one fixed salary line

**Acceptance:** a goal can be created, funded from real transactions, and shows a completion
date derived from actual history.

---

## Phase 5 — Phone as a second capture surface (optional)

Deliberately last of the core phases, and genuinely optional — the laptop is the primary
surface and the app is complete without this. Build it only once desk-based use is habitual,
and scope it to capture: entering a transaction on the go and glancing at the remaining
budget. The month view and trends stay desktop concerns.

1. PWA manifest, service worker, offline shell, installable from Safari on iOS.
2. Optimistic writes with an outbox so entries made without connectivity sync on return.
3. Access: run the same container on a home server or small VPS, reach it over Tailscale.
   No port forwarding, no public exposure.
4. Auth lands here and only here: single-user session, password hashed with argon2,
   secure cookie. If it is reachable, it is authenticated.
5. Backups before remote access, not after — nightly copy of the SQLite file, plus
   `sqlite3 .backup` on a schedule and a documented one-command restore.

**Acceptance:** an entry made on the phone appears on the laptop, the app is installable to
the home screen, and a restore from backup has been performed at least once. Desktop capture
speed is unchanged — re-run the Phase 1 keyboard test and confirm no regression.

---

## Phase 6 — Splits and settle-up

The Excel workbook encodes shared costs as inline arithmetic and settles a nine-person trip
on a separate manual sheet. Model it properly:

- Mark a transaction as shared, with participants and share amounts
- A running balance per person
- Settlement records that clear balances
- Migrate the `Holiday booking` sheet as the first real test case

---

## Risks

| Risk | Mitigation |
|---|---|
| Capture is still too slow and the app is abandoned like the date column | Phase 1 is gated on a measured 5-second round trip, not a subjective judgement |
| Category unification during import goes wrong and silently corrupts history | Reconciliation gate to the cent, per month, before anything else is built |
| Scope creep into splits/imports before the core loop works | Phases are ordered by the stated priorities; do not reorder |
| Data loss on a single SQLite file | Backups land in Phase 5, before the DB is reachable from anywhere but the laptop |
| Building for a year and never migrating off Excel | Phase 2 ends with a hard switch — after parity, Excel is read-only |

## Open questions

- Should `save` transactions (pension savings, transfers) count against spending, or be
  excluded from the spend total? Excel counted them in `Total Spend`; a case can be made
  either way, and the answer changes every chart in Phase 3.
- Refunds and reimbursements: negative amounts on the original category, or a separate
  income kind? Affects the Uber Eats style entries that were netted inline in Excel.
- Does the interface stay English, or switch to Dutch for category names?
