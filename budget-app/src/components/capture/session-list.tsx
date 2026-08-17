"use client";

import { formatAmount, formatShortDate } from "@/lib/format";
import type { CaptureFormData, Category } from "@/lib/types";

interface SessionEntry extends CaptureFormData {
  id: string;
  savedAt: string;
  category?: Category;
}

interface SessionListProps {
  entries: SessionEntry[];
  categories: Category[];
  onUndo: () => void;
}

export function SessionList({ entries, categories, onUndo }: SessionListProps) {
  if (entries.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: 200,
          color: "var(--i40)",
          fontSize: 14,
          gap: 8,
          border: "1px dashed var(--i22)",
        }}
      >
        <span style={{ fontSize: 24 }}>⌨</span>
        <span>Saved entries will appear here</span>
        <span style={{ fontSize: 12 }}>Enter amounts without touching the mouse</span>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <h6 className="section-label">
          This session — {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </h6>
        <button
          type="button"
          onClick={onUndo}
          className="btn btn-ghost"
          style={{ height: 24, padding: "0 8px", fontSize: 12 }}
        >
          <kbd style={{ fontSize: 10 }}>⌘Z</kbd> Undo
        </button>
      </div>

      <table style={{ fontSize: 14 }}>
        <thead>
          <tr>
            <th style={{ width: 60 }}>Date</th>
            <th>Description</th>
            <th style={{ width: 100 }}>Category</th>
            <th style={{ width: 90, textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {[...entries].reverse().map((entry, i) => {
            const cat = categories.find((c) => c.id === entry.categoryId);
            const isLast = i === 0;
            return (
              <tr
                key={entry.id}
                className={cat ? `swatch-${cat.kind}` : "swatch-none"}
                style={{
                  background: isLast ? "var(--i04)" : "transparent",
                }}
              >
                <td
                  style={{
                    fontSize: 12,
                    color: "var(--i55)",
                    fontVariantNumeric: "tabular-nums",
                    paddingLeft: 8,
                  }}
                >
                  {formatShortDate(entry.occurredOn)}
                </td>
                <td>
                  <span style={{ fontWeight: isLast ? 600 : 400 }}>
                    {entry.description}
                  </span>
                </td>
                <td>
                  <span
                    className={`badge badge-${cat?.kind ?? "need"}`}
                    style={{ fontSize: 11 }}
                  >
                    {cat?.name ?? "—"}
                  </span>
                </td>
                <td
                  className="amount"
                  style={{
                    textAlign: "right",
                    fontSize: 13,
                    fontWeight: isLast ? 600 : 400,
                  }}
                >
                  {formatAmount(entry.amountCents)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} style={{ paddingTop: 10, paddingBottom: 0, border: "none" }} />
            <td
              className="amount"
              style={{
                textAlign: "right",
                paddingTop: 10,
                paddingBottom: 0,
                borderTop: "2px solid var(--color-divider)",
                borderBottom: "none",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {formatAmount(entries.reduce((s, e) => s + e.amountCents, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export type { SessionEntry };
