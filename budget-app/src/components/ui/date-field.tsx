"use client";

import { useEffect, useRef, useState } from "react";
import { parseRelativeDate, today } from "@/lib/format";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();
// Monday-first offset for the 1st of the month
const leadingBlanks = (y: number, m: number) => (new Date(y, m - 1, 1).getDay() + 6) % 7;
const iso = (y: number, m: number, d: number) =>
  `${y}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;

function shift(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  return iso(next.getFullYear(), next.getMonth() + 1, next.getDate());
}

function shiftMonth(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const targetY = y + Math.floor((m - 1 + months) / 12);
  const targetM = ((((m - 1 + months) % 12) + 12) % 12) + 1;
  return iso(targetY, targetM, Math.min(d, daysInMonth(targetY, targetM)));
}

/**
 * Text field that keeps every typed shorthand ("-1", "28/7", "2026-8-1") working,
 * with a calendar popover beside it. The popover is keyboard-navigable: arrows move
 * by day/week, PageUp/PageDown by month, Enter picks, Escape closes.
 */
export function DateField({
  value,
  onChange,
  onBlur,
  invalid,
  inputRef,
  inputStyle,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  inputStyle?: React.CSSProperties;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  const popRef = useRef<HTMLDivElement>(null);

  const base = today();
  const resolved = parseRelativeDate(value, base);
  const [cursor, setCursor] = useState(() => resolved ?? base);

  // Re-anchor the calendar whenever the typed value resolves to a real date
  useEffect(() => {
    if (resolved) setCursor(resolved);
  }, [resolved]);

  useEffect(() => {
    if (open) popRef.current?.focus();
  }, [open]);

  function pick(date: string) {
    onChange(date);
    setOpen(false);
    ref.current?.focus();
  }

  function onCalendarKey(e: React.KeyboardEvent) {
    const moves: Record<string, number> = {
      ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
    };
    if (e.key in moves) {
      e.preventDefault();
      setCursor((c) => shift(c, moves[e.key]));
    } else if (e.key === "PageUp") {
      e.preventDefault();
      setCursor((c) => shiftMonth(c, -1));
    } else if (e.key === "PageDown") {
      e.preventDefault();
      setCursor((c) => shiftMonth(c, 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(cursor);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      ref.current?.focus();
    }
  }

  const [cy, cm] = cursor.split("-").map(Number);
  const blanks = leadingBlanks(cy, cm);
  const total = daysInMonth(cy, cm);

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 4 }}>
        <input
          id={id}
          ref={ref}
          className="input"
          type="text"
          value={value}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={(e) => {
            // Alt+Down is the conventional "open the picker" chord
            if (e.altKey && e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
            }
          }}
          style={{
            flex: 1,
            fontVariantNumeric: "tabular-nums",
            borderColor: invalid ? "var(--over-text)" : undefined,
            ...inputStyle,
          }}
        />
        <button
          type="button"
          aria-label="Open calendar"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="btn btn-secondary"
          style={{ flex: "0 0 auto", padding: "0 9px", fontSize: 14, ...(inputStyle?.height ? { height: inputStyle.height } : {}) }}
        >
          ▦
        </button>
      </div>

      {open && (
        <>
          {/* Click-away catcher */}
          <div
            onMouseDown={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 60 }}
          />
          <div
            ref={popRef}
            tabIndex={-1}
            role="dialog"
            aria-label="Choose a date"
            onKeyDown={onCalendarKey}
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 4,
              zIndex: 61,
              background: "var(--color-surface)",
              border: "1px solid var(--color-divider)",
              boxShadow: "var(--shadow-md)",
              padding: 10,
              width: 238,
              outline: "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setCursor((c) => shiftMonth(c, -1))}
                style={{ all: "unset", cursor: "pointer", padding: "2px 6px", fontSize: 13, color: "var(--i55)" }}
              >
                ‹
              </button>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {MONTHS[cm - 1]} {cy}
              </span>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setCursor((c) => shiftMonth(c, 1))}
                style={{ all: "unset", cursor: "pointer", padding: "2px 6px", fontSize: 13, color: "var(--i55)" }}
              >
                ›
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--i40)",
                    textAlign: "center",
                    paddingBottom: 4,
                  }}
                >
                  {w}
                </div>
              ))}

              {Array.from({ length: blanks }, (_, i) => <div key={`b${i}`} />)}

              {Array.from({ length: total }, (_, i) => {
                const day = i + 1;
                const date = iso(cy, cm, day);
                const isSelected = date === resolved;
                const isCursor = date === cursor;
                const isToday = date === base;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => pick(date)}
                    style={{
                      all: "unset",
                      textAlign: "center",
                      padding: "4px 0",
                      fontSize: 12,
                      cursor: "pointer",
                      fontVariantNumeric: "tabular-nums",
                      background: isSelected
                        ? "var(--color-accent)"
                        : isCursor
                        ? "var(--i08)"
                        : "transparent",
                      color: isSelected ? "var(--color-bg)" : "var(--color-text)",
                      fontWeight: isToday || isSelected ? 700 : 400,
                      outline: isToday && !isSelected ? "1px solid var(--i22)" : undefined,
                      outlineOffset: -1,
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--color-divider)" }}>
              <button
                type="button"
                onClick={() => pick(base)}
                style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--color-accent)", fontWeight: 600 }}
              >
                Today
              </button>
              <span style={{ fontSize: 10, color: "var(--i40)" }}>↑↓←→ · Enter · Esc</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
