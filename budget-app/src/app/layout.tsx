export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { ensureDb } from "@/lib/db/ensure-ready";
import { getAvailableMonths } from "@/lib/db/queries/months";

export const metadata: Metadata = {
  title: "Budget",
  description: "Personal finance tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  ensureDb();
  const availableMonths = getAvailableMonths().map((m) => m.month);

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppShell availableMonths={availableMonths}>{children}</AppShell>
      </body>
    </html>
  );
}
