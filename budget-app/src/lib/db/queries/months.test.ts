import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Point the DB layer at a throwaway file before it is imported.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-test-"));
process.env.BUDGET_DB_PATH = path.join(tmpDir, "test.db");

const { migrateAndSeed } = await import("../migrate");
const {
  replaceBudgetLines,
  generateMonthFrom,
  getBudgetLinesForMonth,
  getMonth,
} = await import("./months");
const { getAllCategories, setCategoryArchived } = await import("./categories");

migrateAndSeed();

const plannedByCategory = (month: string) =>
  Object.fromEntries(
    getBudgetLinesForMonth(month).map((l) => [l.categoryName, l.plannedCents])
  );

describe("replaceBudgetLines", () => {
  it("edits, adds and removes in a single call", () => {
    const before = getBudgetLinesForMonth("2026-08");
    expect(before.length).toBeGreaterThan(2);

    const edited  = before[0];
    const removed = before[1];
    const kept    = before.slice(2);

    // A category with no line in this month, to add
    const used = new Set(before.map((l) => l.categoryId));
    const toAdd = getAllCategories().find((c) => !used.has(c.id));

    replaceBudgetLines("2026-08", [
      { categoryId: edited.categoryId, plannedCents: 12_345 },
      ...kept.map((l) => ({ categoryId: l.categoryId, plannedCents: l.plannedCents })),
      ...(toAdd ? [{ categoryId: toAdd.id, plannedCents: 5_000 }] : []),
    ]);

    const after = getBudgetLinesForMonth("2026-08");
    const byId = new Map(after.map((l) => [l.categoryId, l.plannedCents]));

    expect(byId.get(edited.categoryId)).toBe(12_345);
    expect(byId.has(removed.categoryId)).toBe(false);
    for (const l of kept) expect(byId.get(l.categoryId)).toBe(l.plannedCents);
    if (toAdd) expect(byId.get(toAdd.id)).toBe(5_000);
  });

  it("deletes every line for the month when given an empty set", () => {
    replaceBudgetLines("2026-07", []);
    expect(getBudgetLinesForMonth("2026-07")).toHaveLength(0);
  });
});

describe("generateMonthFrom", () => {
  it("copies planned amounts, income and percentages to the target month", () => {
    const source = getMonth("2026-08")!;
    const expected = plannedByCategory("2026-08");

    generateMonthFrom("2026-08", "2026-09");

    const target = getMonth("2026-09")!;
    expect(target.incomeProjectedCents).toBe(source.incomeProjectedCents);
    expect(target.incomeActualCents).toBe(source.incomeProjectedCents);
    expect(target.pctNeed).toBe(source.pctNeed);
    expect(target.pctWant).toBe(source.pctWant);
    expect(target.pctSave).toBe(source.pctSave);
    expect(plannedByCategory("2026-09")).toEqual(expected);
  });

  it("skips archived categories", () => {
    const line = getBudgetLinesForMonth("2026-09")[0];
    setCategoryArchived(line.categoryId, "2026-08-11");

    generateMonthFrom("2026-09", "2026-10");

    const names = getBudgetLinesForMonth("2026-10").map((l) => l.categoryName);
    expect(names).not.toContain(line.categoryName);
    expect(names).toHaveLength(getBudgetLinesForMonth("2026-09").length - 1);
  });

  it("refuses to generate from a month that does not exist", () => {
    expect(() => generateMonthFrom("2030-01", "2030-02")).toThrow();
  });
});
