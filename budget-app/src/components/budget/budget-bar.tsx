"use client";

import { formatAmount } from "@/lib/format";

interface BudgetBarProps {
  plannedCents: number;
  spentCents: number;
  size?: "full" | "compact" | "tiny";
}

// Track width by size
const TRACK_WIDTH = { full: 180, compact: 120, tiny: 60 };

export function BudgetBar({ plannedCents, spentCents, size = "compact" }: BudgetBarProps) {
  const trackWidth = TRACK_WIDTH[size];
  const hasPlan = plannedCents > 0;
  const ratio = hasPlan ? spentCents / plannedCents : 0;
  const isOver = ratio > 1;
  const diff = plannedCents - spentCents;

  // Fill: clamp at track width; overflow shown separately
  const fillWidth = hasPlan ? Math.min(ratio, 1) * trackWidth : 0;
  const overflowWidth = isOver ? Math.min((ratio - 1) * trackWidth, trackWidth * 0.5) : 0;

  if (!hasPlan) {
    // No plan: hatch pattern, dashed border
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: trackWidth,
            height: size === "tiny" ? 4 : 8,
            border: "2px dashed var(--i30)",
            background: `repeating-linear-gradient(
              135deg,
              var(--i12) 0 1px,
              transparent 1px 4px
            )`,
            position: "relative",
            flexShrink: 0,
          }}
        >
          {spentCents > 0 && (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                height: "100%",
                width: trackWidth,
                background: `repeating-linear-gradient(
                  135deg,
                  var(--i55) 0 1px,
                  transparent 1px 4px
                )`,
              }}
            />
          )}
        </div>
        {size !== "tiny" && spentCents > 0 && (
          <span className="amount" style={{ fontSize: 12, color: "var(--i55)" }}>
            {formatAmount(spentCents)} unplanned
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {/* Track */}
      <div
        style={{
          position: "relative",
          width: trackWidth + (isOver ? overflowWidth : 0),
          height: size === "tiny" ? 4 : 8,
          background: "var(--i08)",
          flexShrink: 0,
        }}
      >
        {/* Spend fill */}
        {fillWidth > 0 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              width: fillWidth,
              background: "var(--color-text)",
              opacity: isOver ? 0.4 : 0.7,
            }}
          />
        )}

        {/* Overflow fill (over-budget segment in red tint) */}
        {isOver && (
          <div
            style={{
              position: "absolute",
              left: trackWidth,
              top: 0,
              height: "100%",
              width: overflowWidth,
              background: "var(--over-text)",
              opacity: 0.85,
            }}
          />
        )}

        {/* Plan marker line at 100% */}
        <div
          style={{
            position: "absolute",
            left: trackWidth - 1,
            top: -2,
            height: size === "tiny" ? 8 : 12,
            width: 2,
            background: "var(--sig-plan)",
          }}
        />
      </div>

      {/* Diff label */}
      {size !== "tiny" && (
        <span
          className="amount"
          style={{
            fontSize: 12,
            color: isOver ? "var(--over-text)" : "var(--i55)",
            fontWeight: isOver ? 600 : 400,
          }}
        >
          {isOver ? `+${formatAmount(-diff)}` : formatAmount(diff)}
        </span>
      )}
    </div>
  );
}
