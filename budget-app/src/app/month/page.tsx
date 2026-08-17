export const dynamic = "force-dynamic";

import { ensureDb } from "@/lib/db/ensure-ready";
import { getMonth, getBudgetLinesForMonth, getAvailableMonths } from "@/lib/db/queries/months";
import { getTransactionsForMonth } from "@/lib/db/queries/transactions";
import { getActiveCategories } from "@/lib/db/queries/categories";
import { formatAmount, formatMonth, formatDate } from "@/lib/format";
import { BudgetBar } from "@/components/budget/budget-bar";
import { MonthTransactionList } from "@/components/month/transaction-list";

const BLOCKS = [
  { key: "living",        label: "Living expenses" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "regular",       label: "Regular expenses" },
  { key: "misc",          label: "Miscellaneous" },
] as const;

export default async function MonthPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  ensureDb();

  const { month: monthParam } = await searchParams;
  const availableMonths = getAvailableMonths();
  const CURRENT_MONTH = monthParam && /^\d{4}-\d{2}$/.test(monthParam)
    ? monthParam
    : (availableMonths[0]?.month ?? "2026-08");

  const month     = getMonth(CURRENT_MONTH) ?? {
    month: CURRENT_MONTH,
    incomeProjectedCents: 0,
    incomeActualCents: 0,
    pctNeed: 0.5,
    pctWant: 0.25,
    pctSave: 0.25,
    closedAt: null,
  };
  const lines      = getBudgetLinesForMonth(CURRENT_MONTH);
  const txs        = getTransactionsForMonth(CURRENT_MONTH);
  const categories = getActiveCategories();

  // Financials
  const saveAlloc     = Math.round(month.incomeActualCents * month.pctSave);
  const spendable     = month.incomeActualCents - saveAlloc;
  const totalSpent    = lines.reduce((s, l) => s + l.spentCents, 0);
  const remaining     = spendable - totalSpent;

  const needSpent = lines.filter((l) => l.categoryKind === "need").reduce((s, l) => s + l.spentCents, 0);
  const wantSpent = lines.filter((l) => l.categoryKind === "want").reduce((s, l) => s + l.spentCents, 0);
  const saveSpent = lines.filter((l) => l.categoryKind === "save").reduce((s, l) => s + l.spentCents, 0);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(520px, 1fr) minmax(420px, 1fr)",
        gap: 0,
        minHeight: "100vh",
      }}
    >
      {/* Left: Budget lines */}
      <div
        style={{
          borderRight: "1px solid var(--color-divider)",
          padding: "28px 24px",
          overflowY: "auto",
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <h5>{formatMonth(month.month)}</h5>
        </div>

        {/* Income summary */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 1,
            marginBottom: 24,
            background: "var(--color-divider)",
          }}
        >
          {[
            { label: "Income",    value: month.incomeActualCents },
            { label: "Spendable", value: spendable },
            { label: "Remaining", value: remaining, warn: remaining < 0 },
          ].map((item) => (
            <div key={item.label} style={{ background: "var(--color-bg)", padding: "14px 16px" }}>
              <div className="section-label" style={{ marginBottom: 4 }}>{item.label}</div>
              <div
                className="amount"
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "warn" in item && item.warn ? "var(--over-text)" : "var(--color-text)",
                }}
              >
                {formatAmount(item.value)}
              </div>
            </div>
          ))}
        </div>

        {/* NWS split */}
        <div style={{ marginBottom: 24 }}>
          <h6 className="section-label" style={{ marginBottom: 10 }}>Need / Want / Save</h6>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { kind: "need", label: "Need", target: Math.round(month.incomeActualCents * month.pctNeed), actual: needSpent, pct: month.pctNeed },
              { kind: "want", label: "Want", target: Math.round(month.incomeActualCents * month.pctWant), actual: wantSpent, pct: month.pctWant },
              { kind: "save", label: "Save", target: Math.round(month.incomeActualCents * month.pctSave), actual: saveSpent, pct: month.pctSave },
            ].map((row) => (
              <div key={row.kind} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, fontSize: 12, fontWeight: 600, color: `var(--sig-${row.kind})` }}>
                  {Math.round(row.pct * 100)}%
                </div>
                <span className="section-label" style={{ width: 36 }}>{row.label}</span>
                <BudgetBar plannedCents={row.target} spentCents={row.actual} size="full" />
                <span className="amount muted" style={{ fontSize: 13, width: 90 }}>
                  {formatAmount(row.actual)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <hr style={{ marginBottom: 24 }} />

        {/* Budget lines by block */}
        {BLOCKS.map((block) => {
          const blockLines = lines.filter((l) => l.categoryBlock === block.key);
          if (!blockLines.length) return null;
          const blockPlanned = blockLines.reduce((s, l) => s + l.plannedCents, 0);
          const blockSpent   = blockLines.reduce((s, l) => s + l.spentCents, 0);

          return (
            <div key={block.key} style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                <h6 className="section-label">{block.label}</h6>
                <span className="amount muted" style={{ fontSize: 12 }}>
                  {formatAmount(blockSpent)} / {formatAmount(blockPlanned)}
                </span>
              </div>
              <table style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th style={{ width: 230 }}>Pace</th>
                    <th style={{ width: 90, textAlign: "right" }}>Plan</th>
                    <th style={{ width: 90, textAlign: "right" }}>Spent</th>
                    <th style={{ width: 90, textAlign: "right" }}>Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {blockLines.map((line) => {
                    const diff  = line.plannedCents - line.spentCents;
                    const isOver = diff < 0;
                    return (
                      <tr key={line.id} className={isOver ? "row-over" : ""}>
                        <td className={`swatch-${line.categoryKind}`} style={{ paddingLeft: 8, fontSize: 14 }}>
                          {line.categoryName}
                        </td>
                        <td>
                          <BudgetBar plannedCents={line.plannedCents} spentCents={line.spentCents} size="compact" />
                        </td>
                        <td className="amount" style={{ textAlign: "right", fontSize: 13, color: "var(--i55)" }}>
                          {formatAmount(line.plannedCents)}
                        </td>
                        <td className="amount" style={{ textAlign: "right", fontSize: 13 }}>
                          {formatAmount(line.spentCents)}
                        </td>
                        <td
                          className="amount"
                          style={{
                            textAlign: "right",
                            fontSize: 13,
                            color: isOver ? "var(--over-text)" : "var(--sig-ok)",
                            fontWeight: isOver ? 600 : 400,
                          }}
                        >
                          {isOver ? `+${formatAmount(-diff)}` : formatAmount(diff)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}

        {/* Totals */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 1,
            background: "var(--color-divider)",
            marginTop: 8,
          }}
        >
          {[
            { label: "Total planned", value: lines.reduce((s, l) => s + l.plannedCents, 0) },
            { label: "Total spent",   value: totalSpent },
            { label: "Remaining",     value: remaining, warn: remaining < 0 },
          ].map((item) => (
            <div key={item.label} style={{ background: "var(--color-surface)", padding: "12px 16px" }}>
              <div className="section-label" style={{ marginBottom: 2 }}>{item.label}</div>
              <div
                className="amount"
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "warn" in item && item.warn ? "var(--over-text)" : "var(--color-text)",
                }}
              >
                {formatAmount(item.value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Transactions */}
      <MonthTransactionList transactions={txs} categories={categories} />
    </div>
  );
}
