import { db } from "../index";
import { months, budgetLines, categories, transactions } from "../schema";
import { eq, sql, desc, and, isNull, notInArray } from "drizzle-orm";

export function getMonth(month: string) {
  return db.select().from(months).where(eq(months.month, month)).get();
}

export function upsertMonth(data: {
  month:                string;
  incomeProjectedCents: number;
  incomeActualCents?:   number;
  pctNeed:              number;
  pctWant:              number;
  pctSave:              number;
}) {
  return db
    .insert(months)
    .values({
      month:                data.month,
      incomeProjectedCents: data.incomeProjectedCents,
      incomeActualCents:    data.incomeActualCents ?? 0,
      pctNeed:              data.pctNeed,
      pctWant:              data.pctWant,
      pctSave:              data.pctSave,
    })
    .onConflictDoUpdate({
      target: months.month,
      set: {
        incomeProjectedCents: data.incomeProjectedCents,
        incomeActualCents:    data.incomeActualCents ?? data.incomeProjectedCents,
        pctNeed:              data.pctNeed,
        pctWant:              data.pctWant,
        pctSave:              data.pctSave,
      },
    })
    .run();
}

export function getBudgetLinesForMonth(month: string) {
  return db
    .select({
      id:           budgetLines.id,
      month:        budgetLines.month,
      categoryId:   budgetLines.categoryId,
      plannedCents: budgetLines.plannedCents,
      categoryName:  categories.name,
      categoryKind:  categories.kind,
      categoryGroupId: categories.groupId,
      categoryOrder: categories.sortOrder,
      spentCents: sql<number>`
        COALESCE((
          SELECT SUM(t.amount_cents)
          FROM transactions t
          WHERE t.category_id = ${budgetLines.categoryId}
            AND substr(t.occurred_on, 1, 7) = ${month}
            AND t.kind = 'expense'
        ), 0)
      `.as("spent_cents"),
    })
    .from(budgetLines)
    .innerJoin(categories, eq(budgetLines.categoryId, categories.id))
    .where(eq(budgetLines.month, month))
    .orderBy(categories.sortOrder)
    .all();
}

export function upsertBudgetLine(month: string, categoryId: number, plannedCents: number) {
  return db
    .insert(budgetLines)
    .values({ month, categoryId, plannedCents })
    .onConflictDoUpdate({
      target: [budgetLines.month, budgetLines.categoryId],
      set: { plannedCents },
    })
    .run();
}

export function getAvailableMonths() {
  return db
    .select({ month: months.month })
    .from(months)
    .orderBy(desc(months.month))
    .all();
}

// The plan page always sends the complete set of lines for a month, so any line
// missing from `lines` was removed in the editor and is deleted here.
export function replaceBudgetLines(
  month: string,
  lines: { categoryId: number; plannedCents: number }[]
) {
  const keep = lines.map((l) => l.categoryId);
  for (const line of lines) {
    upsertBudgetLine(month, line.categoryId, line.plannedCents);
  }
  db.delete(budgetLines)
    .where(
      keep.length
        ? and(eq(budgetLines.month, month), notInArray(budgetLines.categoryId, keep))
        : eq(budgetLines.month, month)
    )
    .run();
}

export function generateMonthFrom(sourceMonth: string, targetMonth: string) {
  const source = getMonth(sourceMonth);
  if (!source) throw new Error(`Source month ${sourceMonth} does not exist`);

  const sourceLines = db
    .select({
      categoryId:   budgetLines.categoryId,
      plannedCents: budgetLines.plannedCents,
    })
    .from(budgetLines)
    .innerJoin(categories, eq(budgetLines.categoryId, categories.id))
    .where(and(eq(budgetLines.month, sourceMonth), isNull(categories.archivedAt)))
    .all();

  db.transaction((tx) => {
    tx.insert(months)
      .values({
        month:                targetMonth,
        incomeProjectedCents: source.incomeProjectedCents,
        // Matches savePlan's "treat projected = actual" simplification; leaving
        // this at 0 would make the new month's month-view read € 0 spendable.
        incomeActualCents:    source.incomeProjectedCents,
        pctNeed:              source.pctNeed,
        pctWant:              source.pctWant,
        pctSave:              source.pctSave,
      })
      .run();

    for (const line of sourceLines) {
      tx.insert(budgetLines)
        .values({ month: targetMonth, categoryId: line.categoryId, plannedCents: line.plannedCents })
        .run();
    }
  });

  return sourceLines.length;
}
