"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { parseAmount, today, parseRelativeDate } from "@/lib/format";
import { DateField } from "@/components/ui/date-field";
import type { Category, CaptureFormData, Confidence } from "@/lib/types";

type FieldErrors = {
  amount?: string;
  description?: string;
  category?: string;
  date?: string;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" style={{ fontSize: 12, color: "var(--over-text)", fontWeight: 600, marginTop: 4 }}>
      {message}
    </div>
  );
}

const errorBorder = (invalid: boolean) =>
  invalid ? { borderColor: "var(--over-text)" } : undefined;

type PastDescription = { description: string; categoryId: number; count: number };

function predictCategory(
  description: string,
  past: PastDescription[]
): { categoryId: number; confidence: Confidence } | null {
  if (!description.trim()) return null;
  const lower = description.toLowerCase().trim();
  const exact = past.find((d) => d.description.toLowerCase() === lower);
  if (exact) return { categoryId: exact.categoryId, confidence: "high" };
  const partial = past.find(
    (d) =>
      d.description.toLowerCase().startsWith(lower) ||
      lower.startsWith(d.description.toLowerCase())
  );
  if (partial) return { categoryId: partial.categoryId, confidence: "medium" };
  return null;
}

function getSuggestions(description: string, past: PastDescription[]): PastDescription[] {
  if (!description.trim()) return [];
  const lower = description.toLowerCase();
  return past.filter((d) => d.description.toLowerCase().includes(lower)).slice(0, 5);
}

interface CaptureFormProps {
  onSave: (data: CaptureFormData) => void;
  categories: Category[];
  pastDescriptions: PastDescription[];
  saving?: boolean;
  /** Server-side rejection, shown above the Save button. */
  serverError?: string | null;
}

export function CaptureForm({ onSave, categories, pastDescriptions, saving = false, serverError = null }: CaptureFormProps) {
  const [amountStr, setAmountStr] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [dateStr, setDateStr] = useState(today());
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [suggestions, setSuggestions] = useState<PastDescription[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [catFilter, setCatFilter] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const clearError = (field: keyof FieldErrors) =>
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));

  const amountRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);
  const catRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  // Focus amount on mount
  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  // Update category prediction when description changes
  useEffect(() => {
    const sugg = getSuggestions(description, pastDescriptions);
    setSuggestions(sugg);
    setShowSuggestions(sugg.length > 0 && !!description);
    setSuggestionIndex(-1);

    const pred = predictCategory(description, pastDescriptions);
    if (pred) {
      setCategoryId(pred.categoryId);
      setConfidence(pred.confidence);
    } else {
      if (!description) {
        setCategoryId(null);
        setConfidence(null);
      }
    }
  }, [description, pastDescriptions]);

  const selectedCategory = categories.find((c) => c.id === categoryId);

  const handleDescKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSuggestionIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSuggestionIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && suggestionIndex >= 0) {
      e.preventDefault();
      acceptSuggestion(suggestions[suggestionIndex]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const acceptSuggestion = (s: PastDescription) => {
    setDescription(s.description);
    setCategoryId(s.categoryId);
    setConfidence("high");
    setShowSuggestions(false);
    catRef.current?.focus();
  };

  const handleSave = useCallback(() => {
    const amountCents = parseAmount(amountStr);
    // Every field is checked before anything is sent, so one bad field reports
    // itself rather than reaching the server action and throwing.
    const next: FieldErrors = {};
    if (!amountStr.trim())            next.amount = "Enter an amount";
    else if (amountCents === null)    next.amount = "Not a valid amount — try 12,50";
    else if (amountCents <= 0)        next.amount = "Amount must be greater than zero";
    if (!description.trim())          next.description = "Enter a description";
    if (!categoryId)                  next.category = "Select a category";

    const dateResolved = parseRelativeDate(dateStr, today());
    if (!dateStr.trim())              next.date = "Enter a date";
    else if (dateResolved === null)   next.date = "Not a valid date — try 2026-08-01, 28/7 or -1";

    setErrors(next);
    if (Object.keys(next).length > 0) {
      if (next.amount) amountRef.current?.focus();
      else if (next.description) descRef.current?.focus();
      else if (next.category) catRef.current?.focus();
      else dateRef.current?.focus();
      return;
    }

    onSave({
      amountCents: amountCents!,
      description: description.trim(),
      categoryId: categoryId!,
      occurredOn: dateResolved!,
    });

    // Reset form
    setAmountStr("");
    setDescription("");
    setCategoryId(null);
    setConfidence(null);
    setDateStr(today());
    setErrors({});
    setShowSuggestions(false);
    amountRef.current?.focus();
  }, [amountStr, description, categoryId, dateStr, onSave]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter" && !showSuggestions) {
      e.preventDefault();
      handleSave();
    }
  };

  // Fallback picks when nothing is predicted: the categories the rules hit most often
  const topCategories = (() => {
    const weight = new Map<number, number>();
    for (const p of pastDescriptions) {
      weight.set(p.categoryId, (weight.get(p.categoryId) ?? 0) + p.count);
    }
    return [...weight.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => categories.find((c) => c.id === id && !c.archivedAt))
      .filter((c): c is Category => Boolean(c))
      .slice(0, 3);
  })();

  const filteredCats = categories.filter(
    (c) =>
      !c.archivedAt &&
      c.name.toLowerCase().includes(catFilter.toLowerCase())
  );

  return (
    <form
      onKeyDown={handleKeyDown}
      onSubmit={(e) => { e.preventDefault(); handleSave(); }}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      {/* Amount */}
      <div>
        <label className="section-label" style={{ display: "block", marginBottom: 4 }}>
          Amount
        </label>
        <input
          ref={amountRef}
          className="input"
          type="text"
          inputMode="decimal"
          placeholder="€ 0,00"
          value={amountStr}
          aria-invalid={!!errors.amount || undefined}
          onChange={(e) => { setAmountStr(e.target.value); clearError("amount"); }}
          onFocus={() => setShowSuggestions(false)}
          style={{ fontVariantNumeric: "tabular-nums", ...errorBorder(!!errors.amount) }}
        />
        <FieldError message={errors.amount} />
      </div>

      {/* Description with autocomplete */}
      <div style={{ position: "relative" }}>
        <label className="section-label" style={{ display: "block", marginBottom: 4 }}>
          Description
        </label>
        <input
          ref={descRef}
          className="input"
          type="text"
          placeholder="Merchant or description"
          value={description}
          aria-invalid={!!errors.description || undefined}
          onChange={(e) => { setDescription(e.target.value); clearError("description"); }}
          onKeyDown={handleDescKeyDown}
          onFocus={() => setShowSuggestions(suggestions.length > 0)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          autoComplete="off"
          style={errorBorder(!!errors.description)}
        />
        <FieldError message={errors.description} />
        {showSuggestions && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 50,
              background: "var(--color-surface)",
              border: "1px solid var(--color-divider)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            {suggestions.map((s, i) => (
              <button
                key={s.description}
                type="button"
                onMouseDown={() => acceptSuggestion(s)}
                style={{
                  all: "unset",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "8px 10px",
                  fontSize: 14,
                  cursor: "pointer",
                  background: i === suggestionIndex ? "var(--i08)" : "transparent",
                  boxSizing: "border-box",
                }}
              >
                <span>{s.description}</span>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--i55)",
                    background: "var(--i08)",
                    padding: "1px 6px",
                  }}
                >
                  {categories.find((c) => c.id === s.categoryId)?.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Category */}
      <div style={{ position: "relative" }}>
        <label className="section-label" style={{ display: "block", marginBottom: 4 }}>
          Category
          {confidence && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.06em",
                color:
                  confidence === "high"
                    ? "var(--sig-ok)"
                    : confidence === "medium"
                    ? "var(--sig-want)"
                    : "var(--i55)",
              }}
            >
              {confidence === "high" ? "✓ confident" : confidence === "medium" ? "⚠ uncertain" : "? unknown"}
            </span>
          )}
        </label>
        <div
          style={{
            display: "flex",
            gap: 6,
          }}
        >
          <input
            ref={catRef}
            className="input"
            type="text"
            placeholder="Type to filter categories…"
            value={showCatPicker ? catFilter : (selectedCategory?.name ?? "")}
            aria-invalid={!!errors.category || undefined}
            onChange={(e) => {
              setCatFilter(e.target.value);
              setShowCatPicker(true);
              clearError("category");
            }}
            onFocus={() => {
              setCatFilter("");
              setShowCatPicker(true);
            }}
            onBlur={() => setTimeout(() => setShowCatPicker(false), 150)}
            style={{
              borderColor: errors.category
                ? "var(--over-text)"
                : confidence === "medium"
                ? "var(--sig-want)"
                : undefined,
            }}
          />
          {selectedCategory && (
            <span
              className={`badge badge-${selectedCategory.kind}`}
              style={{ flexShrink: 0 }}
            >
              {selectedCategory.kind}
            </span>
          )}
        </div>
        <FieldError message={errors.category} />

        {showCatPicker && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 50,
              background: "var(--color-surface)",
              border: "1px solid var(--color-divider)",
              boxShadow: "var(--shadow-md)",
              maxHeight: 240,
              overflowY: "auto",
            }}
          >
            {filteredCats.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: 13, color: "var(--i55)" }}>
                No categories found
              </div>
            )}
            {["living", "subscriptions", "regular", "misc"].map((block) => {
              const blockCats = filteredCats.filter((c) => c.block === block);
              if (!blockCats.length) return null;
              return (
                <div key={block}>
                  <div
                    style={{
                      padding: "6px 10px 2px",
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--i40)",
                    }}
                  >
                    {block}
                  </div>
                  {blockCats.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => {
                        setCategoryId(c.id);
                        setConfidence(null);
                        setShowCatPicker(false);
                        setCatFilter("");
                        clearError("category");
                        dateRef.current?.focus();
                      }}
                      style={{
                        all: "unset",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "7px 10px",
                        fontSize: 14,
                        cursor: "pointer",
                        background: categoryId === c.id ? "var(--i08)" : "transparent",
                        boxSizing: "border-box",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "var(--i08)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                          categoryId === c.id ? "var(--i08)" : "transparent";
                      }}
                    >
                      <span>{c.name}</span>
                      <span className={`badge badge-${c.kind}`}>{c.kind}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Date */}
      <div>
        <label className="section-label" style={{ display: "block", marginBottom: 4 }}>
          Date
          <span className="muted" style={{ marginLeft: 6, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            today, -1, 28/7 · ⌥↓ for calendar
          </span>
        </label>
        <DateField
          inputRef={dateRef}
          value={dateStr}
          invalid={!!errors.date}
          onChange={(next) => { setDateStr(next); clearError("date"); }}
          onBlur={() => {
            if (dateStr.trim() && parseRelativeDate(dateStr, today()) === null) {
              setErrors((e) => ({ ...e, date: "Not a valid date — try 2026-08-01, 28/7 or -1" }));
            }
          }}
        />
        <FieldError message={errors.date} />
      </div>

      {/* Server-side rejection (the per-field ones render beside their input) */}
      {serverError && (
        <div role="alert" style={{ fontSize: 13, color: "var(--over-text)", fontWeight: 600 }}>
          {serverError}
        </div>
      )}

      {/* Submit */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
        <button type="submit" className="btn btn-primary" style={{ flex: 1, opacity: saving ? 0.6 : 1 }} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <kbd style={{ fontSize: 11, padding: "3px 7px" }}>Enter</kbd>
      </div>

      {/* Top-3 categories when no prediction */}
      {!confidence && !categoryId && (
        <div>
          <div className="section-label" style={{ marginBottom: 6 }}>
            Most used
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {topCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => { setCategoryId(cat.id); setConfidence(null); clearError("category"); }}
                className="btn btn-secondary"
                style={{ height: 28, padding: "0 10px", fontSize: 13, fontWeight: 400 }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
