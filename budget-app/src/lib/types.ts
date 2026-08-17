export type Kind = "need" | "want" | "save";
export type Block = "living" | "subscriptions" | "regular" | "misc";
export type DatePrecision = "day" | "month";
export type EntrySource = "manual" | "import";

export interface Category {
  id: number;
  name: string;
  kind: Kind;
  block: Block;
  sortOrder: number;
  archivedAt: string | null;
}

export interface Transaction {
  id: number;
  occurredOn: string;       // YYYY-MM-DD
  datePrecision: DatePrecision;
  description: string;
  amountCents: number;      // positive = expense, negative = refund
  categoryId: number;
  category?: Category;
  kind: "expense" | "income";
  note: string | null;
  entrySource: EntrySource;
  createdAt: string;
}

export interface BudgetLine {
  id: number;
  month: string;            // YYYY-MM
  categoryId: number;
  category?: Category;
  plannedCents: number;
  spentCents?: number;      // computed
}

export interface Month {
  month: string;            // YYYY-MM
  incomeProjectedCents: number;
  incomeActualCents: number;
  pctNeed: number;
  pctWant: number;
  pctSave: number;
  closedAt: string | null;
}

export interface MerchantRule {
  id: number;
  pattern: string;
  categoryId: number;
  hitCount: number;
  lastUsedOn: string;
}

export interface Goal {
  id: number;
  name: string;
  targetCents: number;
  savedCents: number;
  priority: "high" | "medium" | "low";
  targetDate: string | null;
  achievedAt: string | null;
}

// Capture form
export interface CaptureFormData {
  amountCents: number;
  description: string;
  categoryId: number;
  occurredOn: string;
  note?: string;
}

// Confidence level for category prediction
export type Confidence = "high" | "medium" | "low";

export interface Prediction {
  categoryId: number;
  confidence: Confidence;
}
