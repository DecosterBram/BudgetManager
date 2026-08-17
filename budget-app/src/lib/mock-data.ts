import type { Category, Transaction, BudgetLine, Month, Goal } from "./types";

export const CATEGORIES: Category[] = [
  // Living
  { id: 1,  name: "Rent",               kind: "need", block: "living",        sortOrder: 1,  archivedAt: null },
  { id: 2,  name: "Electricity + Heating", kind: "need", block: "living",     sortOrder: 2,  archivedAt: null },
  { id: 3,  name: "Water",              kind: "need", block: "living",        sortOrder: 3,  archivedAt: null },
  { id: 4,  name: "Internet",           kind: "need", block: "living",        sortOrder: 4,  archivedAt: null },
  { id: 5,  name: "Insurance",          kind: "need", block: "living",        sortOrder: 5,  archivedAt: null },
  { id: 6,  name: "Afval",              kind: "need", block: "living",        sortOrder: 6,  archivedAt: null },
  // Subscriptions
  { id: 7,  name: "Spotify",            kind: "want", block: "subscriptions", sortOrder: 1,  archivedAt: null },
  { id: 8,  name: "iCloud",             kind: "want", block: "subscriptions", sortOrder: 2,  archivedAt: null },
  { id: 9,  name: "Claude",             kind: "want", block: "subscriptions", sortOrder: 3,  archivedAt: null },
  // Regular
  { id: 10, name: "Groceries",          kind: "need", block: "regular",       sortOrder: 1,  archivedAt: null },
  { id: 11, name: "Food",               kind: "want", block: "regular",       sortOrder: 2,  archivedAt: null },
  { id: 12, name: "Fun",                kind: "want", block: "regular",       sortOrder: 3,  archivedAt: null },
  { id: 13, name: "Clothes",            kind: "want", block: "regular",       sortOrder: 4,  archivedAt: null },
  { id: 14, name: "Hairdresser",        kind: "want", block: "regular",       sortOrder: 5,  archivedAt: null },
  { id: 15, name: "Parking",            kind: "need", block: "regular",       sortOrder: 6,  archivedAt: null },
  { id: 16, name: "Gym",                kind: "want", block: "regular",       sortOrder: 7,  archivedAt: null },
  // Misc
  { id: 17, name: "Gifts",              kind: "want", block: "misc",          sortOrder: 1,  archivedAt: null },
  { id: 18, name: "Pension Savings",    kind: "save", block: "misc",          sortOrder: 2,  archivedAt: null },
  { id: 19, name: "Other",              kind: "need", block: "misc",          sortOrder: 3,  archivedAt: null },
];

export const CURRENT_MONTH: Month = {
  month: "2026-08",
  incomeProjectedCents: 280000,  // € 2.800,00
  incomeActualCents: 283500,     // € 2.835,00
  pctNeed: 0.50,
  pctWant: 0.25,
  pctSave: 0.25,
  closedAt: null,
};

export const BUDGET_LINES: BudgetLine[] = [
  // Living
  { id:  1, month: "2026-08", categoryId:  1, plannedCents:  75000, category: CATEGORIES[0] },
  { id:  2, month: "2026-08", categoryId:  2, plannedCents:  12000, category: CATEGORIES[1] },
  { id:  3, month: "2026-08", categoryId:  3, plannedCents:   2500, category: CATEGORIES[2] },
  { id:  4, month: "2026-08", categoryId:  4, plannedCents:   5000, category: CATEGORIES[3] },
  { id:  5, month: "2026-08", categoryId:  5, plannedCents:   8000, category: CATEGORIES[4] },
  { id:  6, month: "2026-08", categoryId:  6, plannedCents:   1500, category: CATEGORIES[5] },
  // Subscriptions
  { id:  7, month: "2026-08", categoryId:  7, plannedCents:   1099, category: CATEGORIES[6] },
  { id:  8, month: "2026-08", categoryId:  8, plannedCents:    299, category: CATEGORIES[7] },
  { id:  9, month: "2026-08", categoryId:  9, plannedCents:  10000, category: CATEGORIES[8] },
  // Regular
  { id: 10, month: "2026-08", categoryId: 10, plannedCents:  30000, category: CATEGORIES[9] },
  { id: 11, month: "2026-08", categoryId: 11, plannedCents:  15000, category: CATEGORIES[10] },
  { id: 12, month: "2026-08", categoryId: 12, plannedCents:  10000, category: CATEGORIES[11] },
  { id: 13, month: "2026-08", categoryId: 13, plannedCents:   5000, category: CATEGORIES[12] },
  { id: 14, month: "2026-08", categoryId: 14, plannedCents:   3500, category: CATEGORIES[13] },
  { id: 15, month: "2026-08", categoryId: 15, plannedCents:   2000, category: CATEGORIES[14] },
  { id: 16, month: "2026-08", categoryId: 16, plannedCents:   4000, category: CATEGORIES[15] },
  // Misc
  { id: 17, month: "2026-08", categoryId: 17, plannedCents:   5000, category: CATEGORIES[16] },
  { id: 18, month: "2026-08", categoryId: 18, plannedCents:  50000, category: CATEGORIES[17] },
  { id: 19, month: "2026-08", categoryId: 19, plannedCents:   2000, category: CATEGORIES[18] },
];

export const TRANSACTIONS: Transaction[] = [
  { id:  1, occurredOn: "2026-08-01", datePrecision: "day", description: "Rent August",    amountCents:  75000, categoryId:  1, category: CATEGORIES[0], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-01T09:00:00" },
  { id:  2, occurredOn: "2026-08-01", datePrecision: "day", description: "Pension savings", amountCents: 50000, categoryId: 18, category: CATEGORIES[17], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-01T09:05:00" },
  { id:  3, occurredOn: "2026-08-01", datePrecision: "day", description: "Spotify",         amountCents:  1099, categoryId:  7, category: CATEGORIES[6], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-01T09:10:00" },
  { id:  4, occurredOn: "2026-08-01", datePrecision: "day", description: "iCloud",          amountCents:   299, categoryId:  8, category: CATEGORIES[7], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-01T09:15:00" },
  { id:  5, occurredOn: "2026-08-01", datePrecision: "day", description: "Claude",          amountCents: 10000, categoryId:  9, category: CATEGORIES[8], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-01T09:20:00" },
  { id:  6, occurredOn: "2026-08-02", datePrecision: "day", description: "Aldi",            amountCents:  2134, categoryId: 10, category: CATEGORIES[9], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-02T11:00:00" },
  { id:  7, occurredOn: "2026-08-03", datePrecision: "day", description: "Delhaize",        amountCents:  1876, categoryId: 10, category: CATEGORIES[9], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-03T16:00:00" },
  { id:  8, occurredOn: "2026-08-03", datePrecision: "day", description: "Uber Eats",       amountCents:  2450, categoryId: 11, category: CATEGORIES[10], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-03T20:00:00" },
  { id:  9, occurredOn: "2026-08-04", datePrecision: "day", description: "Kapper",          amountCents:  3500, categoryId: 14, category: CATEGORIES[13], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-04T10:00:00" },
  { id: 10, occurredOn: "2026-08-05", datePrecision: "day", description: "Carrefour",       amountCents:  3218, categoryId: 10, category: CATEGORIES[9], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-05T14:00:00" },
  { id: 11, occurredOn: "2026-08-05", datePrecision: "day", description: "AH",              amountCents:   894, categoryId: 10, category: CATEGORIES[9], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-05T17:00:00" },
  { id: 12, occurredOn: "2026-08-06", datePrecision: "day", description: "Watergroep",      amountCents:  2500, categoryId:  3, category: CATEGORIES[2], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-06T09:00:00" },
  { id: 13, occurredOn: "2026-08-07", datePrecision: "day", description: "Aldi",            amountCents:  2867, categoryId: 10, category: CATEGORIES[9], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-07T11:00:00" },
  { id: 14, occurredOn: "2026-08-08", datePrecision: "day", description: "Fun evening",     amountCents:  4500, categoryId: 12, category: CATEGORIES[11], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-08T22:00:00" },
  { id: 15, occurredOn: "2026-08-09", datePrecision: "day", description: "Delhaize",        amountCents:  1543, categoryId: 10, category: CATEGORIES[9], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-09T15:00:00" },
  { id: 16, occurredOn: "2026-08-09", datePrecision: "day", description: "Parking Q-Park",  amountCents:   600, categoryId: 15, category: CATEGORIES[14], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-09T12:00:00" },
  { id: 17, occurredOn: "2026-08-10", datePrecision: "day", description: "Ikea",            amountCents: 12400, categoryId: 19, category: CATEGORIES[18], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-10T14:00:00" },
  { id: 18, occurredOn: "2026-08-11", datePrecision: "day", description: "Apotheek",        amountCents:  1890, categoryId: 19, category: CATEGORIES[18], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-11T10:00:00" },
  { id: 19, occurredOn: "2026-08-12", datePrecision: "day", description: "Gym membership",  amountCents:  4000, categoryId: 16, category: CATEGORIES[15], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-12T08:00:00" },
  { id: 20, occurredOn: "2026-08-12", datePrecision: "day", description: "AH",              amountCents:  2211, categoryId: 10, category: CATEGORIES[9], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-12T17:00:00" },
  { id: 21, occurredOn: "2026-08-13", datePrecision: "day", description: "Jumbo",           amountCents:  1745, categoryId: 10, category: CATEGORIES[9], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-13T11:00:00" },
  { id: 22, occurredOn: "2026-08-13", datePrecision: "day", description: "Uber Eats",       amountCents:  1890, categoryId: 11, category: CATEGORIES[10], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-13T20:00:00" },
  { id: 23, occurredOn: "2026-08-14", datePrecision: "day", description: "Clothes - Zara",  amountCents:  7900, categoryId: 13, category: CATEGORIES[12], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-14T15:00:00" },
  { id: 24, occurredOn: "2026-08-15", datePrecision: "day", description: "Birthday gift",   amountCents:  3000, categoryId: 17, category: CATEGORIES[16], kind: "expense", note: null, entrySource: "manual", createdAt: "2026-08-15T10:00:00" },
];

// Total spent per category in current month
export function getSpentByCategoryId(categoryId: number): number {
  return TRANSACTIONS
    .filter((t) => t.categoryId === categoryId && t.kind === "expense")
    .reduce((sum, t) => sum + t.amountCents, 0);
}

// Budget lines enriched with spent
export const ENRICHED_BUDGET_LINES = BUDGET_LINES.map((line) => ({
  ...line,
  spentCents: getSpentByCategoryId(line.categoryId),
}));

export const GOALS: Goal[] = [
  {
    id: 1,
    name: "Emergency fund",
    targetCents: 600000,   // € 6.000
    savedCents: 220000,    // € 2.200
    priority: "high",
    targetDate: "2027-06-01",
    achievedAt: null,
  },
  {
    id: 2,
    name: "New laptop",
    targetCents: 250000,   // € 2.500
    savedCents: 75000,     // € 750
    priority: "medium",
    targetDate: "2026-12-01",
    achievedAt: null,
  },
  {
    id: 3,
    name: "Holiday 2027",
    targetCents: 300000,   // € 3.000
    savedCents: 0,
    priority: "low",
    targetDate: "2027-07-01",
    achievedAt: null,
  },
];

// Trends: monthly spend history (last 6 months)
export const MONTHLY_TOTALS = [
  { month: "2026-02", totalCents: 182400 },
  { month: "2026-03", totalCents: 195000 },
  { month: "2026-04", totalCents: 173200 },
  { month: "2026-05", totalCents: 204500 },
  { month: "2026-06", totalCents: 189300 },
  { month: "2026-07", totalCents: 177800 },
  { month: "2026-08", totalCents: 208420 },  // current
];
