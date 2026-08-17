"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./sidebar";

export function AppShell({ children, availableMonths }: { children: React.ReactNode; availableMonths: string[] }) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as "light" | "dark" | null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "t" && !e.metaKey && !e.ctrlKey) {
        setTheme((t) => (t === "dark" ? "light" : "dark"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "200px 1fr",
        minHeight: "100vh",
      }}
    >
      <Sidebar theme={theme} onThemeToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} availableMonths={availableMonths} />
      <main
        style={{
          minWidth: 0,
          paddingBottom: 34,
          overflowX: "auto",
        }}
      >
        {children}
      </main>
    </div>
  );
}
