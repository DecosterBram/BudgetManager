"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
import { formatMonth } from "@/lib/format";

const NAV_ITEMS = [
  { key: "c", label: "Capture",  href: "/capture",  shortcut: "g c" },
  { key: "m", label: "Month",    href: "/month",    shortcut: "g m" },
  { key: "p", label: "Plan",     href: "/plan",     shortcut: "g p" },
  { key: "t", label: "Trends",   href: "/trends",   shortcut: "g t" },
  { key: "g", label: "Goals",    href: "/goals",    shortcut: "g g" },
  { key: "s", label: "Settings", href: "/settings", shortcut: "g s" },
];

const SHORTCUTS = [
  { key: "n", label: "New" },
  { key: "t", label: "Theme" },
  { key: "g", label: "Go to…" },
  { key: "⌘Z", label: "Undo" },
];

// The selected month lives only in the URL, so tab switches have to carry it along.
// Read at click time rather than via useSearchParams: this component sits in the
// layout, and a prerendered page (/goals) would need a Suspense boundary for the hook.
function withMonth(href: string) {
  const month = new URLSearchParams(window.location.search).get("month");
  return month ? `${href}?month=${month}` : href;
}

function MonthPickerClient({ availableMonths }: { availableMonths: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("month") ?? availableMonths[0] ?? "";

  if (availableMonths.length <= 1) {
    return (
      <span style={{ display: "block", fontSize: 11, color: "var(--i40)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
        {formatMonth(current)}
      </span>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        marginTop: 4,
        border: "1px solid var(--i18)",
        borderRadius: 3,
        background: "var(--i04)",
      }}
    >
      <select
        value={current}
        onChange={(e) => router.push(`${pathname}?month=${e.target.value}`)}
        style={{
          fontSize: 12,
          color: "var(--color-text)",
          fontVariantNumeric: "tabular-nums",
          background: "transparent",
          border: "none",
          outline: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          padding: "3px 20px 3px 7px",
          appearance: "none",
          WebkitAppearance: "none",
        }}
      >
        {availableMonths.map((m) => (
          <option key={m} value={m}>{formatMonth(m)}</option>
        ))}
      </select>
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: 7,
          fontSize: 9,
          color: "var(--i55)",
          pointerEvents: "none",
        }}
      >
        ▼
      </span>
    </div>
  );
}

interface SidebarProps {
  theme: "light" | "dark";
  onThemeToggle: () => void;
  availableMonths: string[];
}

export function Sidebar({ theme, onThemeToggle, availableMonths }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let gPressed = false;
    let gTimer: ReturnType<typeof setTimeout>;

    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (gPressed) {
        gPressed = false;
        clearTimeout(gTimer);
        const item = NAV_ITEMS.find((n) => n.key === e.key);
        if (item) {
          e.preventDefault();
          router.push(withMonth(item.href));
        }
        return;
      }

      if (e.key === "g") {
        gPressed = true;
        gTimer = setTimeout(() => { gPressed = false; }, 600);
        return;
      }

      if (e.key === "n") {
        e.preventDefault();
        router.push(withMonth("/capture"));
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        borderRight: "2px solid var(--color-divider)",
        background: "var(--color-bg)",
        flexShrink: 0,
      }}
    >
      {/* Logo / brand */}
      <div
        style={{
          padding: "20px 16px 12px",
          borderBottom: "1px solid var(--color-divider)",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--color-text)",
          }}
        >
          Budget
        </span>
        <Suspense fallback={
          <span style={{ display: "block", fontSize: 11, color: "var(--i40)", marginTop: 2 }}>—</span>
        }>
          <MonthPickerClient availableMonths={availableMonths} />
        </Suspense>
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (pathname === "/" && item.href === "/capture");
          return (
            <button
              key={item.key}
              onClick={() => router.push(withMonth(item.href))}
              style={{
                all: "unset",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
                background: active ? "var(--color-text)" : "transparent",
                color: active ? "var(--color-bg)" : "var(--color-text)",
                transition: "background 0.08s linear",
                boxSizing: "border-box",
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "var(--i04)";
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <span>{item.label}</span>
              <kbd
                style={{
                  opacity: 0.5,
                  background: active ? "var(--i08)" : "var(--i08)",
                  color: active ? "var(--color-bg)" : "var(--i70)",
                  border: `1px solid ${active ? "rgba(255,255,255,0.15)" : "var(--i18)"}`,
                }}
              >
                {item.shortcut}
              </kbd>
            </button>
          );
        })}
      </div>

      {/* Keyboard hints + theme toggle */}
      <div
        style={{
          borderTop: "1px solid var(--color-divider)",
          padding: "10px 16px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            marginBottom: 8,
          }}
        >
          {SHORTCUTS.map((s) => (
            <div
              key={s.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                color: "var(--i55)",
              }}
            >
              <kbd>{s.key}</kbd>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        <button
          onClick={onThemeToggle}
          style={{
            all: "unset",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: "var(--i55)",
            cursor: "pointer",
            padding: "2px 0",
          }}
        >
          <span>{theme === "dark" ? "☀" : "☽"}</span>
          <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
        </button>
      </div>
    </nav>
  );
}
