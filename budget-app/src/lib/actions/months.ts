"use server";

import { revalidatePath } from "next/cache";
import { ensureDb } from "@/lib/db/ensure-ready";
import {
  upsertMonth,
  replaceBudgetLines,
  getMonth,
  generateMonthFrom,
} from "@/lib/db/queries/months";
import { nextMonth } from "@/lib/format";
import { z } from "zod/v4";

const MonthSchema = z.object({
  month:                z.string().regex(/^\d{4}-\d{2}$/),
  incomeProjectedCents: z.number().int().nonnegative(),
  pctNeed:              z.number().min(0).max(1),
  pctWant:              z.number().min(0).max(1),
  pctSave:              z.number().min(0).max(1),
  lines: z.array(
    z.object({
      categoryId:   z.number().int().positive(),
      plannedCents: z.number().int().nonnegative(),
    })
  ),
});

export async function savePlan(raw: unknown) {
  ensureDb();
  const parsed = MonthSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }
  const { lines, ...month } = parsed.data;
  // Until actual income tracking is separate, treat projected = actual
  upsertMonth({ ...month, incomeActualCents: month.incomeProjectedCents });
  replaceBudgetLines(month.month, lines);
  revalidatePath("/plan");
  revalidatePath("/month");
  return { ok: true as const };
}

const GenerateSchema = z.string().regex(/^\d{4}-\d{2}$/);

export async function generateNextMonth(rawSourceMonth: unknown) {
  ensureDb();
  const sourceMonth = GenerateSchema.parse(rawSourceMonth);
  const target = nextMonth(sourceMonth);

  if (getMonth(target)) {
    return { ok: false as const, error: `${target} already exists`, month: target };
  }

  const copied = generateMonthFrom(sourceMonth, target);
  revalidatePath("/plan");
  revalidatePath("/month");
  return { ok: true as const, month: target, copied };
}
