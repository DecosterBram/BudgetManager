"use client";

import { GOALS } from "@/lib/mock-data";
import { formatAmount } from "@/lib/format";
import { BudgetBar } from "@/components/budget/budget-bar";

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITY_COLOR = {
  high: "var(--color-accent)",
  medium: "var(--sig-want)",
  low: "var(--i55)",
};

function monthsToComplete(target: number, saved: number, monthlyRate: number): string {
  if (monthlyRate <= 0) return "∞";
  const months = Math.ceil((target - saved) / monthlyRate);
  if (months > 120) return "> 10 years";
  if (months <= 0) return "Achieved";
  return `${months} month${months === 1 ? "" : "s"}`;
}

export default function GoalsPage() {
  const sorted = [...GOALS].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  );

  // Assume monthly save rate from Pension Savings budget line: € 500
  const monthlySaveRate = 50000;

  return (
    <div style={{ padding: "28px 32px", maxWidth: 680 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 28,
        }}
      >
        <div>
          <h5>Savings goals</h5>
          <p className="muted" style={{ marginTop: 4 }}>
            Funded from pension savings contributions
          </p>
        </div>
        <button className="btn btn-primary">
          + Add goal
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {sorted.map((goal) => {
          const ratio = goal.savedCents / goal.targetCents;
          const pct = Math.round(ratio * 100);
          const remaining = goal.targetCents - goal.savedCents;
          const eta = monthsToComplete(goal.targetCents, goal.savedCents, monthlySaveRate);

          return (
            <div
              key={goal.id}
              style={{
                background: "var(--color-surface)",
                padding: "20px 24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <h6
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        letterSpacing: 0,
                        textTransform: "none",
                        color: "var(--color-text)",
                      }}
                    >
                      {goal.name}
                    </h6>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: PRIORITY_COLOR[goal.priority],
                        background: "var(--i04)",
                        padding: "2px 6px",
                      }}
                    >
                      {goal.priority}
                    </span>
                  </div>
                  {goal.targetDate && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      Target:{" "}
                      {new Date(goal.targetDate).toLocaleDateString("en-BE", {
                        month: "long",
                        year: "numeric",
                      })}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    className="amount"
                    style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}
                  >
                    {pct}%
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {formatAmount(goal.savedCents)} of {formatAmount(goal.targetCents)}
                  </div>
                </div>
              </div>

              <BudgetBar
                plannedCents={goal.targetCents}
                spentCents={goal.savedCents}
                size="full"
              />

              <div
                style={{
                  display: "flex",
                  gap: 24,
                  marginTop: 12,
                  fontSize: 13,
                  color: "var(--i55)",
                }}
              >
                <div>
                  <span className="section-label" style={{ marginRight: 6 }}>
                    Remaining
                  </span>
                  <span className="amount">{formatAmount(remaining)}</span>
                </div>
                <div>
                  <span className="section-label" style={{ marginRight: 6 }}>
                    ETA
                  </span>
                  <span>{eta}</span>
                </div>
                <div>
                  <span className="section-label" style={{ marginRight: 6 }}>
                    Rate
                  </span>
                  <span className="amount">{formatAmount(monthlySaveRate)}/month</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {GOALS.length === 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "64px 32px",
            background: "var(--color-surface)",
            color: "var(--i40)",
            textAlign: "center",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 32 }}>◎</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>No goals yet</div>
          <div style={{ fontSize: 14 }}>Add your first savings goal — it takes 20 seconds.</div>
          <button className="btn btn-primary" style={{ marginTop: 8 }}>
            + Add goal
          </button>
        </div>
      )}
    </div>
  );
}
