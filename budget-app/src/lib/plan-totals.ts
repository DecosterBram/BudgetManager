// Money maths for the plan page. Pure, so it can be tested without rendering.
// All amounts are integer cents.

export type PlanKind = "need" | "want" | "save";

export type PlanTotalsInput = {
  incomeCents: number;
  pctNeed: number;
  pctWant: number;
  pctSave: number;
  lines: { kind: PlanKind; plannedCents: number }[];
};

export type PlanTotals = {
  needAlloc: number;
  wantAlloc: number;
  saveAlloc: number;
  spendable: number;
  needPlanned: number;
  wantPlanned: number;
  savePlanned: number;
  totalPlanned: number;
  unallocated: number;
};

export function planTotals({
  incomeCents,
  pctNeed,
  pctWant,
  pctSave,
  lines,
}: PlanTotalsInput): PlanTotals {
  const plannedFor = (kind: PlanKind) =>
    lines.reduce((sum, l) => (l.kind === kind ? sum + l.plannedCents : sum), 0);

  const saveAlloc = Math.round(incomeCents * pctSave);
  const spendable = incomeCents - saveAlloc;
  const totalPlanned = lines.reduce((sum, l) => sum + l.plannedCents, 0);

  return {
    needAlloc: Math.round(incomeCents * pctNeed),
    wantAlloc: Math.round(incomeCents * pctWant),
    saveAlloc,
    spendable,
    needPlanned: plannedFor("need"),
    wantPlanned: plannedFor("want"),
    savePlanned: plannedFor("save"),
    totalPlanned,
    unallocated: spendable - totalPlanned,
  };
}
