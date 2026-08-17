"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatAmount, formatMonth, parseAmount } from "@/lib/format";
import { planTotals, type PlanKind } from "@/lib/plan-totals";
import { savePlan, generateNextMonth } from "@/lib/actions/months";

const BLOCKS = [
  { key: "living",        label: "Living expenses" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "regular",       label: "Regular expenses" },
  { key: "misc",          label: "Miscellaneous" },
] as const;

type Month = {
  month: string;
  incomeProjectedCents: number;
  incomeActualCents: number;
  pctNeed: number;
  pctWant: number;
  pctSave: number;
  closedAt: string | null;
};

type Line = {
  id: number;
  month: string;
  categoryId: number;
  plannedCents: number;
  spentCents: number;
  categoryName: string;
  categoryKind: string;
  categoryBlock: string;
  categoryOrder: number;
};

type Category = {
  id: number;
  name: string;
  kind: PlanKind;
  block: string;
  sortOrder: number;
  archivedAt: string | null;
};

/** One editable budget line. `raw` is the text in the input; cents are parsed from it. */
type Draft = { categoryId: number; raw: string };

const centsOf = (raw: string) => parseAmount(raw) ?? 0;
// A blank field reads as zero; anything unparseable or negative is an error, not a zero.
const amountInvalid = (raw: string) => {
  if (!raw.trim()) return false;
  const cents = parseAmount(raw);
  return cents === null || cents < 0;
};
// Bare "1234,56" — no symbol, matching the income input above. Not derived from
// formatAmount, whose euro sign is followed by a non-breaking space.
const toRaw = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

function snapshot(income: number, pcts: number[], drafts: Draft[]) {
  const lines = drafts
    .map((d) => [d.categoryId, centsOf(d.raw)])
    .sort((a, b) => a[0] - b[0]);
  return JSON.stringify([income, pcts, lines]);
}

function PctInput({
  value,
  onChange,
  color,
}: {
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  const [raw, setRaw] = useState(String(Math.round(value * 100)));
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <input
        className="input"
        type="text"
        inputMode="numeric"
        value={focused ? raw : String(Math.round(value * 100))}
        style={{ width: 52, height: 32, fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color, textAlign: "right", padding: "4px 6px" }}
        onChange={(e) => setRaw(e.target.value.replace(/[^\d]/g, ""))}
        onFocus={() => { setRaw(String(Math.round(value * 100))); setFocused(true); }}
        onBlur={() => {
          setFocused(false);
          const n = parseInt(raw, 10);
          if (!isNaN(n) && n >= 0 && n <= 100) onChange(n / 100);
          else setRaw(String(Math.round(value * 100)));
        }}
      />
      <span style={{ fontSize: 13, color: "var(--i55)" }}>%</span>
    </div>
  );
}

export function PlanClient({
  month,
  lines,
  categories,
  nextMonth,
  nextMonthExists,
}: {
  month: Month;
  lines: Line[];
  categories: Category[];
  nextMonth: string;
  nextMonthExists: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Editable income
  const [incomeRaw, setIncomeRaw] = useState(
    () => (month.incomeProjectedCents / 100).toFixed(2).replace(".", ",")
  );
  const [incomeFocused, setIncomeFocused] = useState(false);
  const incomeCents = parseAmount(incomeRaw) ?? month.incomeProjectedCents;

  // Editable NWS percentages
  const [pctNeed, setPctNeed] = useState(month.pctNeed);
  const [pctWant, setPctWant] = useState(month.pctWant);
  const [pctSave, setPctSave] = useState(month.pctSave);

  // Editable budget lines — the source of truth for every figure on this page
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    lines.map((l) => ({ categoryId: l.categoryId, raw: toRaw(l.plannedCents) }))
  );
  const [addingBlock, setAddingBlock] = useState<string | null>(null);
  const [focusOn, setFocusOn] = useState<number | null>(null);

  const totalPct = Math.round((pctNeed + pctWant + pctSave) * 100);
  const pctValid = totalPct === 100;

  const incomeInvalid = amountInvalid(incomeRaw);
  const invalidLines = drafts.filter((d) => amountInvalid(d.raw)).length;
  const amountsValid = !incomeInvalid && invalidLines === 0;

  function handleNeedChange(v: number) { setPctNeed(v); setPctWant(parseFloat(Math.max(0, 1 - v - pctSave).toFixed(2))); }
  function handleWantChange(v: number) { setPctWant(v); setPctSave(parseFloat(Math.max(0, 1 - pctNeed - v).toFixed(2))); }
  function handleSaveChange(v: number) { setPctSave(v); setPctWant(parseFloat(Math.max(0, 1 - pctNeed - v).toFixed(2))); }

  // Category metadata: active categories, plus any archived one that still has a line here
  const catInfo = useMemo(() => {
    const map = new Map<number, { name: string; kind: PlanKind; block: string }>();
    for (const c of categories) map.set(c.id, { name: c.name, kind: c.kind, block: c.block });
    for (const l of lines) {
      map.set(l.categoryId, {
        name: l.categoryName,
        kind: l.categoryKind as PlanKind,
        block: l.categoryBlock,
      });
    }
    return map;
  }, [categories, lines]);

  const totals = planTotals({
    incomeCents,
    pctNeed,
    pctWant,
    pctSave,
    lines: drafts.map((d) => ({
      kind: catInfo.get(d.categoryId)?.kind ?? "need",
      plannedCents: centsOf(d.raw),
    })),
  });

  const initial = useMemo(
    () => snapshot(
      month.incomeProjectedCents,
      [month.pctNeed, month.pctWant, month.pctSave],
      lines.map((l) => ({ categoryId: l.categoryId, raw: toRaw(l.plannedCents) }))
    ),
    [month, lines]
  );
  const dirty = snapshot(incomeCents, [pctNeed, pctWant, pctSave], drafts) !== initial;

  const usedIds = new Set(drafts.map((d) => d.categoryId));

  function updateDraft(categoryId: number, raw: string) {
    setDrafts((ds) => ds.map((d) => (d.categoryId === categoryId ? { ...d, raw } : d)));
  }

  function addDraft(categoryId: number) {
    setDrafts((ds) => [...ds, { categoryId, raw: "0,00" }]);
    setAddingBlock(null);
    setFocusOn(categoryId);
  }

  function removeDraft(categoryId: number) {
    setDrafts((ds) => ds.filter((d) => d.categoryId !== categoryId));
  }

  function handleSave() {
    if (!pctValid || !amountsValid) return;
    setSaveError(null);
    startTransition(async () => {
      const result = await savePlan({
        month: month.month,
        incomeProjectedCents: incomeCents,
        pctNeed,
        pctWant,
        pctSave,
        lines: drafts.map((d) => ({
          categoryId: d.categoryId,
          plannedCents: centsOf(d.raw),
        })),
      });
      if (!result.ok) {
        setSaveError(result.error ?? "Could not save this plan");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateNextMonth(month.month);
      router.push(`/plan?month=${result.month}`);
    });
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 820 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h5>{formatMonth(month.month)}</h5>
          <p className="muted" style={{ marginTop: 4 }}>Budget plan</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saved && <span style={{ fontSize: 13, color: "var(--sig-ok)" }}>✓ Saved</span>}
          {saveError && (
            <span role="alert" style={{ fontSize: 13, color: "var(--over-text)", fontWeight: 600 }}>{saveError}</span>
          )}
          {invalidLines > 0 && (
            <span role="alert" style={{ fontSize: 13, color: "var(--over-text)", fontWeight: 600 }}>
              {invalidLines} invalid {invalidLines === 1 ? "amount" : "amounts"}
            </span>
          )}
          {nextMonthExists ? (
            <button
              className="btn btn-secondary"
              onClick={() => router.push(`/plan?month=${nextMonth}`)}
            >
              Go to {formatMonth(nextMonth)} →
            </button>
          ) : (
            <button
              className="btn btn-secondary"
              onClick={handleGenerate}
              disabled={isPending || dirty}
              title={dirty ? "Save your changes first" : undefined}
              style={{ opacity: isPending || dirty ? 0.5 : 1 }}
            >
              Generate {formatMonth(nextMonth)}
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={isPending || !pctValid || !amountsValid}
            title={!amountsValid ? "Fix the highlighted amounts first" : undefined}
            style={{ opacity: isPending || !pctValid || !amountsValid ? 0.6 : 1 }}
          >
            {isPending ? "Saving…" : "Save plan"}
          </button>
        </div>
      </div>

      {/* Income + NWS inputs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "200px 1fr",
          gap: 1,
          marginBottom: 28,
          background: "var(--color-divider)",
        }}
      >
        <div style={{ background: "var(--color-bg)", padding: "14px 16px" }}>
          <div className="section-label" style={{ marginBottom: 6 }}>Projected income</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 15, color: "var(--i55)" }}>€</span>
            <input
              className="input"
              type="text"
              inputMode="decimal"
              value={incomeFocused ? incomeRaw : (incomeCents / 100).toFixed(2).replace(".", ",")}
              aria-invalid={incomeInvalid || undefined}
              style={{
                height: 34, fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                ...(incomeInvalid ? { borderColor: "var(--over-text)" } : {}),
              }}
              onChange={(e) => setIncomeRaw(e.target.value)}
              onFocus={() => setIncomeFocused(true)}
              onBlur={() => setIncomeFocused(false)}
            />
          </div>
          {incomeInvalid && (
            <div role="alert" style={{ fontSize: 12, color: "var(--over-text)", fontWeight: 600, marginTop: 4 }}>
              Not a valid amount — try 2.800,00
            </div>
          )}
        </div>

        <div style={{ background: "var(--color-bg)", padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div className="section-label" style={{ marginBottom: 6 }}>Need / Want / Save split</div>
            {!pctValid && (
              <span style={{ fontSize: 11, color: "var(--over-text)", fontWeight: 600 }}>
                Must total 100% — currently {totalPct}%
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            {[
              { label: "Need", color: "var(--sig-need)", value: pctNeed, onChange: handleNeedChange, alloc: totals.needAlloc },
              { label: "Want", color: "var(--sig-want)", value: pctWant, onChange: handleWantChange, alloc: totals.wantAlloc },
              { label: "Save", color: "var(--sig-save)", value: pctSave, onChange: handleSaveChange, alloc: totals.saveAlloc },
            ].map((row) => (
              <div key={row.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span className="section-label" style={{ color: row.color }}>{row.label}</span>
                <PctInput value={row.value} onChange={row.onChange} color={row.color} />
                <span className="amount" style={{ fontSize: 12, color: "var(--i55)" }}>{formatAmount(row.alloc)}</span>
              </div>
            ))}
            <div style={{ marginLeft: "auto", paddingLeft: 24, borderLeft: "1px solid var(--color-divider)", display: "flex", flexDirection: "column", gap: 3 }}>
              <span className="section-label">Spendable</span>
              <span className="amount" style={{ fontSize: 16, fontWeight: 700 }}>{formatAmount(totals.spendable)}</span>
              <span className="amount" style={{ fontSize: 12, color: totals.unallocated < 0 ? "var(--over-text)" : "var(--i55)" }}>
                {formatAmount(Math.abs(totals.unallocated))} {totals.unallocated < 0 ? "over" : "unallocated"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Budget lines by block */}
      {BLOCKS.map((block) => {
        const blockDrafts = drafts.filter(
          (d) => catInfo.get(d.categoryId)?.block === block.key
        );
        const blockTotal = blockDrafts.reduce((s, d) => s + centsOf(d.raw), 0);
        const available = categories.filter(
          (c) => c.block === block.key && !usedIds.has(c.id)
        );

        return (
          <div key={block.key} style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <h6 className="section-label">{block.label}</h6>
              <span className="amount muted" style={{ fontSize: 12 }}>{formatAmount(blockTotal)}</span>
            </div>

            {blockDrafts.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 180 }}>Category</th>
                    <th style={{ width: 160 }}>Planned amount</th>
                    <th style={{ width: 80 }}>Kind</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {blockDrafts.map((draft) => {
                    const info = catInfo.get(draft.categoryId);
                    return (
                      <tr key={draft.categoryId}>
                        <td style={{ paddingLeft: 8 }} className={`swatch-${info?.kind}`}>
                          {info?.name}
                        </td>
                        <td>
                          <input
                            className="input"
                            type="text"
                            inputMode="decimal"
                            autoFocus={focusOn === draft.categoryId}
                            value={draft.raw}
                            aria-invalid={amountInvalid(draft.raw) || undefined}
                            onChange={(e) => updateDraft(draft.categoryId, e.target.value)}
                            onFocus={(e) => e.currentTarget.select()}
                            style={{
                              height: 28, fontSize: 13, fontVariantNumeric: "tabular-nums",
                              ...(amountInvalid(draft.raw) ? { borderColor: "var(--over-text)" } : {}),
                            }}
                          />
                        </td>
                        <td>
                          <span className={`badge badge-${info?.kind}`}>{info?.kind}</span>
                        </td>
                        <td>
                          <button
                            onClick={() => removeDraft(draft.categoryId)}
                            style={{ all: "unset", fontSize: 12, color: "var(--i40)", cursor: "pointer" }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {addingBlock === block.key ? (
              <select
                className="input"
                autoFocus
                defaultValue=""
                onChange={(e) => e.target.value && addDraft(Number(e.target.value))}
                onBlur={() => setAddingBlock(null)}
                style={{ marginTop: 8, height: 28, fontSize: 13 }}
              >
                <option value="" disabled>Choose a category…</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            ) : (
              <button
                className="btn btn-secondary"
                onClick={() => setAddingBlock(block.key)}
                disabled={available.length === 0}
                title={available.length === 0 ? "Every category in this block already has a line" : undefined}
                style={{ marginTop: 8, height: 28, padding: "0 10px", fontSize: 13, opacity: available.length === 0 ? 0.5 : 1 }}
              >
                + Add line
              </button>
            )}
          </div>
        );
      })}

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 1, background: "var(--color-divider)", marginTop: 16 }}>
        {[
          { label: "Need planned",  planned: totals.needPlanned,  alloc: totals.needAlloc,  color: "var(--sig-need)" },
          { label: "Want planned",  planned: totals.wantPlanned,  alloc: totals.wantAlloc,  color: "var(--sig-want)" },
          { label: "Save planned",  planned: totals.savePlanned,  alloc: totals.saveAlloc,  color: "var(--sig-save)" },
          { label: "Total planned", planned: totals.totalPlanned, alloc: totals.spendable,  color: "var(--color-text)" },
        ].map((item) => {
          const diff = item.alloc - item.planned;
          const over = diff < 0;
          return (
            <div key={item.label} style={{ background: "var(--color-surface)", padding: "12px 16px" }}>
              <div className="section-label" style={{ marginBottom: 4, color: item.color }}>{item.label}</div>
              <div className="amount" style={{ fontSize: 16, fontWeight: 700 }}>{formatAmount(item.planned)}</div>
              <div className="amount" style={{ fontSize: 11, marginTop: 3, color: over ? "var(--over-text)" : "var(--i55)", fontWeight: over ? 600 : 400 }}>
                {over ? `${formatAmount(-diff)} over` : `${formatAmount(diff)} left`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
