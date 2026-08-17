"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { CaptureForm } from "@/components/capture/capture-form";
import { SessionList } from "@/components/capture/session-list";
import type { SessionEntry } from "@/components/capture/session-list";
import type { CaptureFormData, Category, Group } from "@/lib/types";
import { saveTransaction, removeTransaction } from "@/lib/actions/transactions";

type PastDescription = { description: string; categoryId: number; count: number };

export function CaptureClient({
  categories,
  groups,
  pastDescriptions,
}: {
  categories: Category[];
  groups: Group[];
  pastDescriptions: PastDescription[];
}) {
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // One DB write per entry, at the moment Save is pressed — nothing is batched.
  const handleSave = (data: CaptureFormData) => {
    setServerError(null);
    startTransition(async () => {
      const result = await saveTransaction(data);
      if (result.ok) {
        setEntries((prev) => [
          ...prev,
          { ...data, id: String(result.id), savedAt: new Date().toISOString() },
        ]);
      } else {
        setServerError(result.error ?? "Could not save this transaction");
      }
    });
  };

  const handleUndo = useCallback(() => {
    setEntries((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      // Undo has to reach the database — the row was written on save.
      const id = Number(last.id);
      if (Number.isInteger(id) && id > 0) {
        startTransition(async () => { await removeTransaction(id); });
      }
      return prev.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleUndo]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(320px, 380px) 1fr",
        gap: 0,
        minHeight: "100vh",
      }}
    >
      {/* Left: form */}
      <div style={{ borderRight: "1px solid var(--color-divider)", padding: "28px 24px" }}>
        <div style={{ marginBottom: 24 }}>
          <h5>New transaction</h5>
          <p className="muted" style={{ marginTop: 4 }}>
            <kbd>n</kbd> from anywhere · <kbd>Enter</kbd> to save
          </p>
        </div>
        <CaptureForm
          onSave={handleSave}
          categories={categories}
          groups={groups}
          pastDescriptions={pastDescriptions}
          saving={isPending}
          serverError={serverError}
        />
      </div>

      {/* Right: session list */}
      <div style={{ padding: "28px 24px" }}>
        <SessionList entries={entries} categories={categories} onUndo={handleUndo} />
      </div>
    </div>
  );
}
