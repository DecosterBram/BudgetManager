"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { formatAmount, formatDate, parseAmount, parseRelativeDate, today } from "@/lib/format";
import { removeTransaction, editTransaction } from "@/lib/actions/transactions";
import { DateField } from "@/components/ui/date-field";

type Tx = {
  id: number;
  occurredOn: string;
  datePrecision: string;
  description: string;
  amountCents: number;
  categoryId: number;
  categoryName: string;
  categoryKind: string;
};

type Cat = { id: number; name: string; kind: string; block: string; archivedAt: string | null };

const BLOCKS = ["living", "subscriptions", "regular", "misc"] as const;

function EditRow({ tx, categories, onDone }: { tx: Tx; categories: Cat[]; onDone: () => void }) {
  const [dateStr, setDateStr] = useState(tx.occurredOn);
  const [description, setDescription] = useState(tx.description);
  const [categoryId, setCategoryId] = useState(tx.categoryId);
  const [amountStr, setAmountStr] = useState(() => {
    const euros = Math.floor(tx.amountCents / 100);
    const cents = (tx.amountCents % 100).toString().padStart(2, "0");
    return `${euros},${cents}`;
  });
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const descRef = useRef<HTMLInputElement>(null);

  useEffect(() => { descRef.current?.focus(); }, []);

  const activeCats = categories.filter((c) => !c.archivedAt);
  const dateInvalid = error.toLowerCase().includes("date");
  const amountInvalid = error.toLowerCase().includes("amount");

  const handleSave = () => {
    const amountCents = parseAmount(amountStr);
    if (amountCents === null)  { setError("Not a valid amount — try 12,50"); return; }
    if (amountCents <= 0)      { setError("Amount must be greater than zero"); return; }
    if (!description.trim())   { setError("Enter a description"); return; }

    // Never fall back to the raw text: an unparseable date must stop here, not
    // reach the server action.
    const dateResolved = parseRelativeDate(dateStr, today());
    if (dateResolved === null) { setError("Not a valid date — try 2026-08-01, 28/7 or -1"); return; }

    startTransition(async () => {
      const result = await editTransaction({
        id: tx.id,
        occurredOn: dateResolved,
        description: description.trim(),
        amountCents,
        categoryId,
      });
      if (result.ok) onDone();
      else setError(result.error ?? "Could not save this change");
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onDone(); return; }
    if (e.key === "Enter" && !(e.target instanceof HTMLSelectElement)) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 155px",
        gap: 4,
        padding: "8px",
        borderBottom: "1px solid var(--i04)",
        background: "var(--i04)",
      }}
    >
      <input
        ref={descRef}
        className="input"
        value={description}
        onChange={(e) => { setDescription(e.target.value); setError(""); }}
        style={{
          height: 28, fontSize: 13, padding: "0 6px",
          ...(error.toLowerCase().includes("description") ? { borderColor: "var(--over-text)" } : {}),
        }}
        placeholder="Description"
      />
      <select
        className="input"
        value={categoryId}
        onChange={(e) => setCategoryId(Number(e.target.value))}
        style={{ height: 28, fontSize: 13, padding: "0 4px" }}
      >
        {BLOCKS.map((block) => {
          const cats = activeCats.filter((c) => c.block === block);
          if (!cats.length) return null;
          return (
            <optgroup key={block} label={block}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
          );
        })}
      </select>
      <div style={{ display: "flex", gap: 4, gridColumn: "1 / -1", alignItems: "center" }}>
        <div style={{ flex: "0 0 132px" }}>
          <DateField
            value={dateStr}
            invalid={dateInvalid}
            onChange={(next) => { setDateStr(next); setError(""); }}
            inputStyle={{ height: 28, fontSize: 13, padding: "0 6px" }}
          />
        </div>
        <input
          className="input"
          value={amountStr}
          onChange={(e) => { setAmountStr(e.target.value); setError(""); }}
          style={{
            flex: 1, height: 28, fontSize: 13, padding: "0 6px", textAlign: "right",
            fontVariantNumeric: "tabular-nums",
            ...(amountInvalid ? { borderColor: "var(--over-text)" } : {}),
          }}
          placeholder="0,00"
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={isPending}
          style={{ height: 28, padding: "0 10px", fontSize: 12 }}
        >
          {isPending ? "…" : "Save"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onDone}
          style={{ height: 28, padding: "0 8px", fontSize: 12 }}
        >
          Cancel
        </button>
      </div>
      {error && (
        <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--over-text)" }}>{error}</div>
      )}
    </div>
  );
}

function TxRow({ tx, categories }: { tx: Tx; categories: Cat[] }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return <EditRow tx={tx} categories={categories} onDone={() => setEditing(false)} />;
  }

  const handleDelete = () => {
    startTransition(async () => {
      await removeTransaction(tx.id);
    });
  };

  return (
    <div
      className={`swatch-${tx.categoryKind}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto auto",
        gap: 8,
        padding: "6px 8px",
        borderBottom: "1px solid var(--i04)",
        alignItems: "center",
        cursor: "default",
        background: hovered ? "var(--i04)" : "transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirming(false); }}
    >
      <div>
        <div style={{ fontSize: 14 }}>{tx.description}</div>
        {tx.datePrecision === "month" && (
          <div style={{ fontSize: 11, color: "var(--i40)" }}>date unknown</div>
        )}
      </div>

      {confirming ? (
        <>
          <span style={{ fontSize: 12, color: "var(--over-text)", fontWeight: 600, whiteSpace: "nowrap" }}>
            Remove?
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setConfirming(false)}
            style={{ height: 24, padding: "0 8px", fontSize: 11 }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleDelete}
            disabled={isPending}
            style={{ height: 24, padding: "0 8px", fontSize: 11, background: "var(--over-text)", color: "var(--color-bg, white)" }}
          >
            {isPending ? "…" : "Delete"}
          </button>
        </>
      ) : (
        <>
          <span className={`badge badge-${tx.categoryKind}`} style={{ fontSize: 11 }}>
            {tx.categoryName}
          </span>
          <span className="amount" style={{ fontSize: 14, fontWeight: 600, minWidth: 80, textAlign: "right" }}>
            {formatAmount(tx.amountCents)}
          </span>
          <div style={{ display: "flex", gap: 2, opacity: hovered ? 1 : 0, pointerEvents: hovered ? "auto" : "none" }}>
            <button
              type="button"
              title="Edit"
              onClick={() => setEditing(true)}
              style={{ all: "unset", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "3px 5px", color: "var(--i55)", borderRadius: 2 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-text)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--i55)"; }}
            >
              ✎
            </button>
            <button
              type="button"
              title="Delete"
              onClick={() => setConfirming(true)}
              style={{ all: "unset", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "3px 5px", color: "var(--i55)", borderRadius: 2 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--over-text)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--i55)"; }}
            >
              ✕
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function MonthTransactionList({
  transactions,
  categories,
}: {
  transactions: Tx[];
  categories: Cat[];
}) {
  const [filter, setFilter] = useState("");

  const filtered = filter
    ? transactions.filter(
        (tx) =>
          tx.description.toLowerCase().includes(filter.toLowerCase()) ||
          tx.categoryName.toLowerCase().includes(filter.toLowerCase())
      )
    : transactions;

  const groups: Record<string, Tx[]> = {};
  for (const tx of filtered) {
    (groups[tx.occurredOn] ??= []).push(tx);
  }
  const days = Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));

  return (
    <div style={{ padding: "28px 24px", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h6 className="section-label">Transactions — {transactions.length}</h6>
        <input
          className="input"
          type="search"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 160, height: 28, fontSize: 13 }}
        />
      </div>

      {days.map(([date, txs]) => (
        <div key={date} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--i55)", marginBottom: 4, paddingBottom: 4, borderBottom: "1px solid var(--i08)" }}>
            {formatDate(date)}
          </div>
          {txs.map((tx) => (
            <TxRow key={tx.id} tx={tx} categories={categories} />
          ))}
          <div className="amount" style={{ textAlign: "right", fontSize: 12, color: "var(--i55)", padding: "4px 8px 0" }}>
            {formatAmount(txs.reduce((s, t) => s + t.amountCents, 0))}
          </div>
        </div>
      ))}

      {days.length === 0 && (
        <div style={{ color: "var(--i40)", fontSize: 14, marginTop: 40, textAlign: "center" }}>
          No transactions{filter ? " matching filter" : " yet"}
        </div>
      )}
    </div>
  );
}
