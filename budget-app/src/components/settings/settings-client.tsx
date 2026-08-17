"use client";

import { useState, useTransition } from "react";
import { currentMonth, formatShortDate } from "@/lib/format";
import { clearMonthTransactions } from "@/lib/actions/transactions";
import {
  createCategory,
  archiveCategory,
  restoreCategory,
  removeMerchantRule,
} from "@/lib/actions/categories";

const BLOCKS = ["living", "subscriptions", "regular", "misc"] as const;
const KINDS = ["need", "want", "save"] as const;

type Category = {
  id: number;
  name: string;
  kind: (typeof KINDS)[number];
  block: (typeof BLOCKS)[number];
  sortOrder: number;
  archivedAt: string | null;
};

type Rule = {
  id: number;
  pattern: string;
  categoryId: number;
  hitCount: number;
  lastUsedOn: string;
  categoryName: string;
};

type TabKey = "categories" | "rules" | "danger";

export function SettingsClient({
  categories,
  rules,
}: {
  categories: Category[];
  rules: Rule[];
}) {
  const [tab, setTab] = useState<TabKey>("categories");
  const [showArchived, setShowArchived] = useState(false);

  const active   = categories.filter((c) => !c.archivedAt);
  const archived = categories.filter((c) => c.archivedAt);

  return (
    <div style={{ padding: "28px 32px", maxWidth: 860 }}>
      <div style={{ marginBottom: 24 }}>
        <h5>Settings</h5>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "2px solid var(--color-divider)",
          marginBottom: 28,
        }}
      >
        {(["categories", "rules", "danger"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              all: "unset",
              padding: "8px 20px",
              fontSize: 14,
              fontWeight: tab === t ? 700 : 400,
              cursor: "pointer",
              borderBottom: tab === t ? "2px solid var(--color-text)" : "2px solid transparent",
              marginBottom: -2,
              textTransform: "capitalize",
            }}
          >
            {t === "categories" ? "Categories" : t === "rules" ? "Merchant rules" : "Danger"}
          </button>
        ))}
      </div>

      {tab === "categories" && (
        <CategoriesTab
          active={active}
          archived={archived}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived((v) => !v)}
        />
      )}
      {tab === "rules" && <RulesTab rules={rules} />}
      {tab === "danger" && <DangerTab />}
    </div>
  );
}

function CategoriesTab({
  active,
  archived,
  showArchived,
  onToggleArchived,
}: {
  active: Category[];
  archived: Category[];
  showArchived: boolean;
  onToggleArchived: () => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <span className="muted">{active.length} active categories</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onToggleArchived}
            className="btn btn-secondary"
            style={{ height: 28, fontSize: 13 }}
          >
            {showArchived ? "Hide archived" : `Show archived (${archived.length})`}
          </button>
          <button className="btn btn-primary" onClick={() => setAdding((v) => !v)}>
            {adding ? "Cancel" : "+ New category"}
          </button>
        </div>
      </div>

      {adding && <NewCategoryForm onDone={() => setAdding(false)} />}

      {BLOCKS.map((block) => {
        const cats = active.filter((c) => c.block === block);
        if (!cats.length) return null;
        return (
          <div key={block} style={{ marginBottom: 24 }}>
            <h6 className="section-label" style={{ marginBottom: 8 }}>
              {block}
            </h6>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th>Name</th>
                  <th style={{ width: 80 }}>Kind</th>
                  <th style={{ width: 100 }}>Block</th>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {cats.map((cat) => (
                  <CategoryRow key={cat.id} cat={cat} />
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {showArchived && archived.length > 0 && (
        <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--color-divider)" }}>
          <h6 className="section-label" style={{ marginBottom: 12 }}>
            Archived ({archived.length}) — history preserved
          </h6>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ width: 80 }}>Kind</th>
                <th style={{ width: 100 }}>Block</th>
                <th style={{ width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {archived.map((cat) => (
                <ArchivedRow key={cat.id} cat={cat} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewCategoryForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("need");
  const [block, setBlock] = useState<(typeof BLOCKS)[number]>("living");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createCategory({ name, kind, block });
      if (result.ok) onDone();
      else setError(result.error);
    });
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        marginBottom: 24,
        padding: "12px 14px",
        background: "var(--color-surface)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <input
          className="input"
          autoFocus
          value={name}
          placeholder="Category name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          style={{ height: 30, fontSize: 13, width: 200 }}
        />
        {error && (
          <span style={{ fontSize: 12, color: "var(--over-text)", fontWeight: 600 }}>{error}</span>
        )}
      </div>
      <select
        className="input"
        value={kind}
        onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
        style={{ height: 30, fontSize: 13 }}
      >
        {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
      <select
        className="input"
        value={block}
        onChange={(e) => setBlock(e.target.value as (typeof BLOCKS)[number])}
        style={{ height: 30, fontSize: 13 }}
      >
        {BLOCKS.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>
      <button
        className="btn btn-primary"
        onClick={submit}
        disabled={isPending || !name.trim()}
        style={{ height: 30, fontSize: 13, opacity: isPending || !name.trim() ? 0.5 : 1 }}
      >
        {isPending ? "Adding…" : "Add"}
      </button>
    </div>
  );
}

function CategoryRow({ cat }: { cat: Category }) {
  const [isPending, startTransition] = useTransition();

  return (
    <tr style={{ opacity: isPending ? 0.5 : 1 }}>
      <td style={{ fontSize: 12, color: "var(--i40)" }}>{cat.sortOrder}</td>
      <td style={{ fontSize: 14 }} className={`swatch-${cat.kind}`}>
        <span style={{ paddingLeft: 8 }}>{cat.name}</span>
      </td>
      <td>
        <span className={`badge badge-${cat.kind}`}>{cat.kind}</span>
      </td>
      <td style={{ fontSize: 13, color: "var(--i55)" }}>{cat.block}</td>
      <td>
        <button
          onClick={() => startTransition(async () => { await archiveCategory(cat.id); })}
          disabled={isPending}
          style={{
            all: "unset",
            fontSize: 12,
            color: "var(--i40)",
            cursor: "pointer",
          }}
        >
          Archive
        </button>
      </td>
    </tr>
  );
}

function ArchivedRow({ cat }: { cat: Category }) {
  const [isPending, startTransition] = useTransition();

  return (
    <tr style={{ opacity: isPending ? 0.3 : 0.5 }}>
      <td style={{ fontSize: 14 }}>{cat.name}</td>
      <td><span className={`badge badge-${cat.kind}`}>{cat.kind}</span></td>
      <td style={{ fontSize: 13, color: "var(--i55)" }}>{cat.block}</td>
      <td>
        <button
          onClick={() => startTransition(async () => { await restoreCategory(cat.id); })}
          disabled={isPending}
          style={{ all: "unset", fontSize: 12, color: "var(--sig-ok)", cursor: "pointer" }}
        >
          Restore
        </button>
      </td>
    </tr>
  );
}

function RulesTab({ rules }: { rules: Rule[] }) {
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <p className="muted">
          Merchant rules are learned automatically when you save transactions.
          Each description match assigns a category — the most frequent wins.
        </p>
      </div>
      {rules.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No rules yet — they appear as you save transactions.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Pattern (normalised)</th>
              <th style={{ width: 140 }}>Category</th>
              <th style={{ width: 80, textAlign: "right" }}>Hits</th>
              <th style={{ width: 100 }}>Last used</th>
              <th style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <RuleRow key={rule.id} rule={rule} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RuleRow({ rule }: { rule: Rule }) {
  const [isPending, startTransition] = useTransition();

  return (
    <tr style={{ opacity: isPending ? 0.4 : 1 }}>
      <td style={{ fontSize: 13, fontFamily: "ui-monospace, monospace" }}>{rule.pattern}</td>
      <td style={{ fontSize: 13 }}>{rule.categoryName}</td>
      <td className="amount" style={{ textAlign: "right", fontSize: 13, color: "var(--i55)" }}>
        {rule.hitCount}
      </td>
      <td style={{ fontSize: 12, color: "var(--i55)" }}>{formatShortDate(rule.lastUsedOn)}</td>
      <td>
        <button
          onClick={() => startTransition(async () => { await removeMerchantRule(rule.id); })}
          disabled={isPending}
          style={{ all: "unset", fontSize: 12, color: "var(--over-text)", cursor: "pointer" }}
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

function DangerTab() {
  const [month, setMonth] = useState(currentMonth());
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClear = () => {
    startTransition(async () => {
      await clearMonthTransactions(month);
      setConfirming(false);
      setDone(month);
    });
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <div
        style={{
          border: "1px solid var(--over-text)",
          borderRadius: 4,
          padding: "20px 24px",
        }}
      >
        <h6 style={{ marginBottom: 4, color: "var(--over-text)", fontWeight: 700 }}>
          Clear month transactions
        </h6>
        <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
          Permanently deletes all transactions for the selected month. Budget lines
          and month settings are kept. This cannot be undone.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <label className="section-label" style={{ whiteSpace: "nowrap" }}>Month</label>
          <input
            className="input"
            value={month}
            onChange={(e) => { setMonth(e.target.value); setConfirming(false); setDone(null); }}
            style={{ width: 110, height: 30, fontSize: 13 }}
            placeholder="YYYY-MM"
          />
        </div>

        {!confirming ? (
          <button
            className="btn"
            onClick={() => setConfirming(true)}
            disabled={!/^\d{4}-\d{2}$/.test(month)}
            style={{ height: 30, padding: "0 14px", fontSize: 13, background: "var(--over-text)", color: "var(--color-bg, white)" }}
          >
            Clear {month}…
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--over-text)" }}>
              Delete all transactions for {month}?
            </span>
            <button
              className="btn btn-secondary"
              onClick={() => setConfirming(false)}
              style={{ height: 30, padding: "0 10px", fontSize: 13 }}
            >
              Cancel
            </button>
            <button
              className="btn"
              onClick={handleClear}
              disabled={isPending}
              style={{ height: 30, padding: "0 12px", fontSize: 13, background: "var(--over-text)", color: "var(--color-bg, white)" }}
            >
              {isPending ? "Deleting…" : "Yes, delete"}
            </button>
          </div>
        )}

        {done && (
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--sig-ok)" }}>
            All transactions for {done} deleted.
          </p>
        )}
      </div>
    </div>
  );
}
