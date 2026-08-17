import { db } from "../index";
import { transactions, categories } from "../schema";
import { and, eq, desc, sql } from "drizzle-orm";

export function getTransactionsForMonth(month: string) {
  return db
    .select({
      id:            transactions.id,
      occurredOn:    transactions.occurredOn,
      datePrecision: transactions.datePrecision,
      description:   transactions.description,
      amountCents:   transactions.amountCents,
      categoryId:    transactions.categoryId,
      kind:          transactions.kind,
      note:          transactions.note,
      entrySource:   transactions.entrySource,
      createdAt:     transactions.createdAt,
      categoryName:  categories.name,
      categoryKind:  categories.kind,
      categoryGroupId: categories.groupId,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(sql`substr(${transactions.occurredOn}, 1, 7) = ${month}`)
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
    .all();
}

export function createTransaction(data: {
  occurredOn:  string;
  description: string;
  amountCents: number;
  categoryId:  number;
  note?:       string;
}) {
  const result = db
    .insert(transactions)
    .values({
      occurredOn:    data.occurredOn,
      datePrecision: "day",
      description:   data.description,
      amountCents:   data.amountCents,
      categoryId:    data.categoryId,
      kind:          "expense",
      note:          data.note ?? null,
      entrySource:   "manual",
      createdAt:     new Date().toISOString(),
    })
    .returning({ id: transactions.id })
    .get();
  return result;
}

export function deleteTransaction(id: number) {
  return db.delete(transactions).where(eq(transactions.id, id)).run();
}

export function deleteTransactionsForMonth(month: string) {
  return db
    .delete(transactions)
    .where(sql`substr(${transactions.occurredOn}, 1, 7) = ${month}`)
    .run();
}

export function updateTransaction(data: {
  id: number;
  occurredOn: string;
  description: string;
  amountCents: number;
  categoryId: number;
  note?: string;
}) {
  return db
    .update(transactions)
    .set({
      occurredOn:  data.occurredOn,
      description: data.description,
      amountCents: data.amountCents,
      categoryId:  data.categoryId,
      note:        data.note ?? null,
    })
    .where(eq(transactions.id, data.id))
    .run();
}

export function getMonthlySpendTotals() {
  return db
    .select({
      month: sql<string>`substr(${transactions.occurredOn}, 1, 7)`.as("month"),
      totalCents: sql<number>`SUM(${transactions.amountCents})`.as("total_cents"),
    })
    .from(transactions)
    .where(eq(transactions.kind, "expense"))
    .groupBy(sql`substr(${transactions.occurredOn}, 1, 7)`)
    .orderBy(sql`substr(${transactions.occurredOn}, 1, 7)`)
    .all();
}

export function getSpendByCategoryForMonth(month: string) {
  return db
    .select({
      categoryId:   transactions.categoryId,
      categoryName: categories.name,
      categoryKind: categories.kind,
      totalCents:   sql<number>`SUM(${transactions.amountCents})`.as("total_cents"),
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(
      sql`substr(${transactions.occurredOn}, 1, 7) = ${month}`,
      eq(transactions.kind, "expense")
    ))
    .groupBy(transactions.categoryId)
    .orderBy(sql`SUM(${transactions.amountCents}) DESC`)
    .all();
}

export function getSpendByKindForMonth(month: string) {
  return db
    .select({
      kind:       categories.kind,
      totalCents: sql<number>`SUM(${transactions.amountCents})`.as("total_cents"),
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(
      sql`substr(${transactions.occurredOn}, 1, 7) = ${month}`,
      eq(transactions.kind, "expense")
    ))
    .groupBy(categories.kind)
    .all();
}
