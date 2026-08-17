"use server";

import { revalidatePath } from "next/cache";
import { ensureDb } from "@/lib/db/ensure-ready";
import { createTransaction, deleteTransaction, updateTransaction, deleteTransactionsForMonth } from "@/lib/db/queries/transactions";
import { isRealDate } from "@/lib/format";
import { z } from "zod/v4";

// Shape *and* calendar validity — the regex alone accepts 2026-13-45.
const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    return isRealDate(y, m, d);
  }, "That date does not exist");

const CreateSchema = z.object({
  occurredOn:  DateString,
  description: z.string().min(1),
  amountCents: z.number().int().positive(),
  categoryId:  z.number().int().positive(),
  note:        z.string().optional(),
});

export async function saveTransaction(raw: unknown) {
  ensureDb();
  // safeParse, not parse: a throw here surfaces as an app-level crash in the client
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }
  const result = createTransaction(parsed.data);
  revalidatePath("/month");
  revalidatePath("/trends");
  return { ok: true as const, id: result?.id };
}

export async function removeTransaction(id: number) {
  ensureDb();
  deleteTransaction(id);
  revalidatePath("/month");
  revalidatePath("/trends");
  return { ok: true };
}

const UpdateSchema = z.object({
  id:          z.number().int().positive(),
  occurredOn:  DateString,
  description: z.string().min(1),
  amountCents: z.number().int().positive(),
  categoryId:  z.number().int().positive(),
  note:        z.string().optional(),
});

export async function editTransaction(raw: unknown) {
  ensureDb();
  const parsed = UpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }
  updateTransaction(parsed.data);
  revalidatePath("/month");
  revalidatePath("/trends");
  return { ok: true as const };
}

export async function clearMonthTransactions(month: string) {
  ensureDb();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid month");
  deleteTransactionsForMonth(month);
  revalidatePath("/month");
  revalidatePath("/trends");
  return { ok: true };
}
