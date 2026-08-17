# frontend-design.md — Design brief

A brief for producing frontend mockups. It fixes the structure, the content and the
constraints; the visual direction is deliberately left open on the axes where it should be.

---

## The product in one line

A private budget app for one person, replacing a spreadsheet, used on a laptop at a desk,
mostly in short sittings — enter the week's transactions, check where the month stands, close it.

That sentence is the design constraint. It is not a mobile app, and it is not an executive
dashboard someone presents from. It is a desktop tool that competes directly with a
spreadsheet the user already likes, so it has to be at least as fast and at least as dense.

## Who uses it

One user. Belgian, mid-career, technical, has tracked his own spending in Excel for a year and
liked it enough to keep doing it manually. He is fluent with keyboards and comfortable with
dense information. He does not need onboarding, tooltips, motivational streaks, or
explanations of what a budget is. He needs the same information he already had, entered
faster, plus one thing he never had: a view across months.

Currency is EUR, formatted `€ 1.234,56`. Week starts Monday. Interface language is English.

## What went wrong last time

The spreadsheet did not fail on features. It failed on friction: he stopped filling in the
date column after three months because it was one field too many. Any screen that adds a step
to entry is a failure, however good it looks.

The second failure was structural — ten months of data with no way to see across them.

## Devices

- **Primary: desktop browser, 1280–1440 wide.** Design this first and completely. Assume a
  keyboard and a mouse, both used, keyboard preferred.
- **Secondary: mobile, 390 × 844.** Capture and a remaining-budget glance only. It comes later
  in the build, so a responsive treatment of those two things is enough — do not design the
  full app twice.
- **Dark mode is required, not optional.** Design both themes; the dark one is not an
  afterthought recolour.

Do not stretch a mobile layout across a desktop viewport. Use the width: side-by-side panels,
persistent navigation, tables that are actually tables.

---

## Screens

### 1. Capture — the screen that decides whether this survives

The realistic session is not one entry. It is the banking app open in another window and
eight transactions typed in a row. Design for the batch.

Layout: an entry form and, beside it, the running list of what has been entered in this
session. The form does not close after a save — it clears and refocuses. There is no modal to
dismiss and reopen between entries.

Fields, in tab order: amount, description (type-ahead over past descriptions), category
(prefilled from the prediction), date (prefilled to today, accepts `-1` and `28/7`).
`Enter` saves.

Design the three prediction states explicitly — they are the heart of the interaction:

- **Confident** — category filled in, quiet, no visual noise. This is the common case and it
  should feel like the app already knew.
- **Uncertain** — category filled in but visibly provisional, correctable without leaving the
  keyboard.
- **Unknown** — no prediction, the three most-used categories offered inline.

Also show: the type-ahead dropdown mid-selection, the running session list with an editable
last row, a duplicate warning, and how keyboard focus is indicated at every step. **Show the
shortcut hints** — this app should teach its own keyboard surface rather than hide it.

### 2. Month

The working view, replacing one Excel sheet. This is where the desktop width earns its keep:
budget lines and transactions should be visible together, not on separate tabs.

Top: actual income, spendable income, remaining budget. Then the Need / Want / Save split
against its target percentages (currently 50 / 25 / 25). Then budget lines in four groups —
Living expenses, Subscriptions, Regular expenses, Miscellaneous — each showing planned, spent
and difference. Alongside, the month's transactions grouped by day, sortable and filterable.

Roughly 20 budget lines and 45 transactions in a month, and all of it should be reachable
without much scrolling. Design for that density honestly; do not mock it up with six rows and
generous padding.

**Required states:** a line under budget, a line at budget, a line over budget, a line with
spending but no plan, and a transaction whose date is only known to the month (imported
history) which must be visibly distinguished without being alarming.

### 3. Trends

The thing the spreadsheet could never do. Twelve months of history, read sitting down.

Total spend per month with a rolling average. The Need/Want/Save mix over time. Per-category
comparison, sorted so the volatile categories surface first. Top merchants by spend and by
frequency. Pace: spend-to-date this month against previous months at the same day.

Clicking any category drills into its transactions across all months. This screen may be the
densest in the app.

### 4. Goals

Savings goals with target, current progress, priority, and a projected completion date derived
from the actual save rate. Design the empty state carefully: the previous attempt at this in
Excel was abandoned after two rows, so starting has to feel like nothing.

### 5. Settings

Category management (with archive, never delete — history depends on old categories), review
of learned merchant rules, next month's budget generated from this month's with a confirmable
diff, and export/backup.

---

## Signature element

Every budget line needs a planned-vs-spent indicator. **Design one that handles overspend as
overflow rather than as a full bar plus a red number.** A bar that clips at 100% throws away
the most useful information on the screen: how far past the line the spending went. This is
the element the whole app will be recognised by — spend the effort here.

It must work at three sizes: full width in the Month view, compact in a list row, and tiny in
a Trends small-multiple.

## Constraints

- **Tabular figures throughout.** Numbers in columns must align. Non-negotiable, and it rules
  out several otherwise attractive typefaces for the numeric role.
- **Keyboard is a first-class input.** Visible, well-designed focus states on every
  interactive element — not the browser default, and not removed. Show shortcut affordances in
  the mockups.
- Need / Want / Save need three distinguishable treatments that survive colour blindness —
  pair colour with shape, label or position.
- Over-budget must be legible without relying on red alone.
- Respect `prefers-reduced-motion`.
- Amounts are the primary information on every screen. Whatever the type scale does, amounts
  win.
- Information density over whitespace, but not at the cost of scanability. The benchmark is a
  well-set financial table, not a card grid.

## Anti-brief

Please avoid, unless you can argue specifically why this product needs it:

- The cream background with a high-contrast serif and a terracotta accent.
- Near-black with a single acid-green accent.
- Fintech gradients, glassmorphism, card shadows, celebratory confetti on saving money.
- Big animated counters. The number is the point; make it readable, not eventful.
- Gamification of any kind — no streaks, badges, or encouragement copy.
- Oversized touch targets and mobile-scale spacing on the desktop layout.

The reference feeling is a well-made kitchen scale: precise, immediate, unbothered, no
personality where personality would get in the way, and one detail that shows someone cared.

## Content for the mockups

Use these real category names: Rent, Electricity + Heating, Water, Internet, Insurance, Afval,
Groceries, Food, Fun, Clothes, Hairdresser, Parking, Gifts, Gym, Spotify, iCloud, Claude,
Pension Savings, Other.

Realistic Belgian merchant descriptions for the transaction list: Aldi, Carrefour, Delhaize,
AH, Jumbo, Kapper, Apotheek, Watergroep, Uber Eats, Ikea.

Invent the amounts, but keep them plausible: groceries between € 1 and € 35, rent around
€ 750, subscriptions € 3–20, monthly total roughly € 1.800.

No Lorem ipsum, no "Merchant Name", no `$1,234.00`.

## Deliverables

1. Desktop, dark and light: all five screens.
2. Desktop states: the three Capture prediction states with the session list populated, one
   over-budget Month line, a Month line with spend but no plan, the Goals empty state.
3. Mobile: capture and a remaining-budget glance only.
4. A component sheet — buttons, chips, the budget indicator at three sizes, inputs and their
   focus states, the transaction row, table headers, empty and error states.
5. Tokens: colour with semantic names, type scale with the numeric face called out, spacing
   scale, radii.

Figma or standalone HTML both fine. HTML is preferred — it feeds straight into the build.

## Out of scope

Onboarding, marketing pages, account creation, multi-user, bank connection screens,
notifications, shared/split expenses (a later phase), and any settings not listed above.
