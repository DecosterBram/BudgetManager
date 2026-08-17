export const dynamic = "force-dynamic";

import { ensureDb } from "@/lib/db/ensure-ready";
import { getMonth, getBudgetLinesForMonth, getAvailableMonths } from "@/lib/db/queries/months";
import { getActiveCategories } from "@/lib/db/queries/categories";
import { nextMonth, currentMonth } from "@/lib/format";
import { PlanClient } from "@/components/plan/plan-client";

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  ensureDb();

  const { month: monthParam } = await searchParams;
  const availableMonths = getAvailableMonths();
  const selected = monthParam && /^\d{4}-\d{2}$/.test(monthParam)
    ? monthParam
    : (availableMonths[0]?.month ?? currentMonth());

  const month = getMonth(selected) ?? {
    month: selected,
    incomeProjectedCents: 0,
    incomeActualCents: 0,
    pctNeed: 0.5,
    pctWant: 0.25,
    pctSave: 0.25,
    closedAt: null,
  };

  const lines = getBudgetLinesForMonth(selected);
  const categories = getActiveCategories();
  const next = nextMonth(selected);

  return (
    <PlanClient
      key={selected}
      month={month}
      lines={lines}
      categories={categories}
      nextMonth={next}
      nextMonthExists={Boolean(getMonth(next))}
    />
  );
}
