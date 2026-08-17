import { describe, it, expect } from "vitest";
import { planTotals } from "./plan-totals";
import { nextMonth, parseAmount, parseRelativeDate } from "./format";

describe("nextMonth", () => {
  it("advances within a year", () => {
    expect(nextMonth("2026-08")).toBe("2026-09");
  });

  it("pads single-digit months", () => {
    expect(nextMonth("2026-01")).toBe("2026-02");
    expect(nextMonth("2026-09")).toBe("2026-10");
  });

  it("rolls over into the next year", () => {
    expect(nextMonth("2026-12")).toBe("2027-01");
  });
});

describe("planTotals", () => {
  const lines = [
    { kind: "need" as const, plannedCents: 100_000 },
    { kind: "need" as const, plannedCents:  40_000 },
    { kind: "want" as const, plannedCents:  50_000 },
    { kind: "save" as const, plannedCents:  60_000 },
  ];

  it("splits the allocation by percentage", () => {
    const t = planTotals({
      incomeCents: 280_000,
      pctNeed: 0.5, pctWant: 0.25, pctSave: 0.25,
      lines: [],
    });
    expect(t.needAlloc).toBe(140_000);
    expect(t.wantAlloc).toBe(70_000);
    expect(t.saveAlloc).toBe(70_000);
  });

  it("computes spendable as income minus the save allocation", () => {
    const t = planTotals({
      incomeCents: 280_000,
      pctNeed: 0.5, pctWant: 0.25, pctSave: 0.25,
      lines: [],
    });
    expect(t.spendable).toBe(210_000);
  });

  it("sums planned amounts per kind", () => {
    const t = planTotals({
      incomeCents: 280_000,
      pctNeed: 0.5, pctWant: 0.25, pctSave: 0.25,
      lines,
    });
    expect(t.needPlanned).toBe(140_000);
    expect(t.wantPlanned).toBe(50_000);
    expect(t.savePlanned).toBe(60_000);
    expect(t.totalPlanned).toBe(250_000);
  });

  it("reports the shortfall as a negative unallocated figure", () => {
    const t = planTotals({
      incomeCents: 280_000,
      pctNeed: 0.5, pctWant: 0.25, pctSave: 0.25,
      lines,
    });
    // spendable 210_000 against 250_000 planned
    expect(t.unallocated).toBe(-40_000);
  });

  it("reports headroom when under-allocated", () => {
    const t = planTotals({
      incomeCents: 280_000,
      pctNeed: 0.5, pctWant: 0.25, pctSave: 0.25,
      lines: [{ kind: "need", plannedCents: 10_000 }],
    });
    expect(t.unallocated).toBe(200_000);
  });

  it("rounds allocations to whole cents", () => {
    const t = planTotals({
      incomeCents: 100_001,
      pctNeed: 0.335, pctWant: 0.335, pctSave: 0.33,
      lines: [],
    });
    expect(Number.isInteger(t.needAlloc)).toBe(true);
    expect(Number.isInteger(t.saveAlloc)).toBe(true);
    expect(t.spendable).toBe(100_001 - t.saveAlloc);
  });

  it("stays in integer cents through a Belgian-formatted round trip", () => {
    // What the plan page actually does: text input -> cents -> totals
    const t = planTotals({
      incomeCents: parseAmount("2.835,00")!,
      pctNeed: 0.5, pctWant: 0.25, pctSave: 0.25,
      lines: [{ kind: "need", plannedCents: parseAmount("1.234,56")! }],
    });
    expect(t.totalPlanned).toBe(123_456);
    expect(t.spendable).toBe(283_500 - 70_875);
  });
});

describe("parseRelativeDate", () => {
  const BASE = "2026-08-11";

  it("accepts full ISO dates", () => {
    expect(parseRelativeDate("2026-08-01", BASE)).toBe("2026-08-01");
  });

  it("accepts single-digit month and day — the input that used to crash", () => {
    expect(parseRelativeDate("2026-08-1", BASE)).toBe("2026-08-01");
    expect(parseRelativeDate("2026-8-1", BASE)).toBe("2026-08-01");
  });

  it("rejects dates that do not exist", () => {
    expect(parseRelativeDate("2026-13-45", BASE)).toBeNull();
    expect(parseRelativeDate("2026-02-30", BASE)).toBeNull();
    expect(parseRelativeDate("32/7", BASE)).toBeNull();
    expect(parseRelativeDate("31/2", BASE)).toBeNull();
  });

  it("knows February has 29 days only in a leap year", () => {
    expect(parseRelativeDate("2028-02-29", BASE)).toBe("2028-02-29");
    expect(parseRelativeDate("2027-02-29", BASE)).toBeNull();
  });

  it("handles relative offsets across a month boundary", () => {
    expect(parseRelativeDate("-1", BASE)).toBe("2026-08-10");
    expect(parseRelativeDate("-11", BASE)).toBe("2026-07-31");
    expect(parseRelativeDate("+1", BASE)).toBe("2026-08-12");
  });

  it("reads day/month with the year from base", () => {
    expect(parseRelativeDate("28/7", BASE)).toBe("2026-07-28");
    expect(parseRelativeDate("28.7", BASE)).toBe("2026-07-28");
    expect(parseRelativeDate("1/1/2027", BASE)).toBe("2027-01-01");
  });

  it("understands today", () => {
    expect(parseRelativeDate("today", BASE)).toBe(BASE);
    expect(parseRelativeDate("t", BASE)).toBe(BASE);
  });

  it("returns null for junk rather than passing it through", () => {
    for (const junk of ["", "   ", "tomorrow", "abc", "2026", "--", "1/", "2026-08-"]) {
      expect(parseRelativeDate(junk, BASE)).toBeNull();
    }
  });
});
