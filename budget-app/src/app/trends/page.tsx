export const dynamic = "force-dynamic";

import { ensureDb } from "@/lib/db/ensure-ready";
import {
  getMonthlySpendTotals,
  getSpendByCategoryForMonth,
  getSpendByKindForMonth,
} from "@/lib/db/queries/transactions";
import { formatAmount, formatMonth } from "@/lib/format";
import { BudgetBar } from "@/components/budget/budget-bar";

function MonthBar({ value, max, month, selected }: { value: number; max: number; month: string; selected: boolean }) {
  const height = Math.round((value / max) * 120);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        flex: 1,
      }}
    >
      <span className="amount" style={{ fontSize: 11, color: "var(--i55)" }}>
        {formatAmount(value)}
      </span>
      <div
        style={{
          width: "100%",
          height: 120,
          display: "flex",
          alignItems: "flex-end",
          position: "relative",
        }}
      >
        <div
          style={{
            width: "100%",
            height,
            background: selected ? "var(--color-accent)" : "var(--color-text)",
            opacity: selected ? 0.85 : 0.55,
            transition: "height 0.3s",
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: selected ? "var(--color-text)" : "var(--i55)", fontWeight: selected ? 700 : 400 }}>
        {new Date(month + "-01").toLocaleDateString("en-BE", { month: "short" })}
      </span>
    </div>
  );
}

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  ensureDb();

  const { month: monthParam } = await searchParams;

  const monthlyTotals    = getMonthlySpendTotals();
  const selectedMonth = monthParam && /^\d{4}-\d{2}$/.test(monthParam)
    ? monthParam
    : (monthlyTotals[monthlyTotals.length - 1]?.month ?? "2026-08");
  const spendByCategory  = getSpendByCategoryForMonth(selectedMonth);
  const spendByKind      = getSpendByKindForMonth(selectedMonth);

  const max = monthlyTotals.length > 0 ? Math.max(...monthlyTotals.map((m) => m.totalCents)) : 1;
  const avg = monthlyTotals.length > 1
    ? Math.round(monthlyTotals.slice(0, -1).reduce((s, m) => s + m.totalCents, 0) / (monthlyTotals.length - 1))
    : (monthlyTotals[0]?.totalCents ?? 0);

  const grandTotal = spendByKind.reduce((s, k) => s + k.totalCents, 0);
  const maxCatTotal = spendByCategory[0]?.totalCents ?? 1;

  return (
    <div style={{ padding: "28px 32px", maxWidth: 900 }}>
      <div style={{ marginBottom: 28 }}>
        <h5>Trends</h5>
        <p className="muted" style={{ marginTop: 4 }}>
          {monthlyTotals.length} month{monthlyTotals.length !== 1 ? "s" : ""} of data
        </p>
      </div>

      {/* Total spend per month */}
      <section style={{ marginBottom: 40 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <h6 className="section-label">Monthly spend</h6>
          <span className="muted" style={{ fontSize: 12 }}>
            avg: {formatAmount(avg)}/month
          </span>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            paddingBottom: 8,
            borderBottom: "1px solid var(--color-divider)",
          }}
        >
          {monthlyTotals.map((m) => (
            <MonthBar key={m.month} value={m.totalCents} max={max} month={m.month} selected={m.month === selectedMonth} />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 12,
            fontSize: 12,
            color: "var(--i55)",
          }}
        >
          <div style={{ width: 24, height: 2, background: "var(--sig-plan)" }} />
          <span>Average — {formatAmount(avg)}/month</span>
        </div>
      </section>

      {/* Need / Want / Save mix */}
      <section style={{ marginBottom: 40 }}>
        <h6 className="section-label" style={{ marginBottom: 16 }}>
          Need / Want / Save — {formatMonth(selectedMonth)}
        </h6>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 1,
            background: "var(--color-divider)",
          }}
        >
          {(["need", "want", "save"] as const).map((kind) => {
            const row = spendByKind.find((k) => k.kind === kind);
            const total = row?.totalCents ?? 0;
            const pct = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;
            return (
              <div key={kind} style={{ background: "var(--color-surface)", padding: "16px 20px" }}>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: `var(--sig-${kind})`,
                    letterSpacing: "-0.02em",
                    marginBottom: 4,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {pct}%
                </div>
                <div className="section-label">{kind}</div>
                <div className="amount muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {formatAmount(total)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Top categories */}
      <section style={{ marginBottom: 40 }}>
        <h6 className="section-label" style={{ marginBottom: 12 }}>
          Spend by category — {formatMonth(selectedMonth)}
        </h6>
        {spendByCategory.length === 0 ? (
          <p className="muted" style={{ fontSize: 14 }}>No transactions for this month.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Kind</th>
                <th style={{ width: 200 }}>Share</th>
                <th style={{ textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {spendByCategory.map(({ categoryId, categoryName, categoryKind, totalCents }) => (
                <tr key={categoryId}>
                  <td style={{ fontSize: 14 }}>{categoryName}</td>
                  <td>
                    <span className={`badge badge-${categoryKind}`}>{categoryKind}</span>
                  </td>
                  <td>
                    <BudgetBar plannedCents={maxCatTotal} spentCents={totalCents} size="compact" />
                  </td>
                  <td className="amount" style={{ textAlign: "right", fontSize: 13 }}>
                    {formatAmount(totalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
