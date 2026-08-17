// Belgian number formatting: € 1.234,56
// All amounts stored as integer cents

export function formatAmount(cents: number): string {
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const centsPart = abs % 100;
  const formatted = `€ ${euros.toLocaleString("nl-BE")},${centsPart.toString().padStart(2, "0")}`;
  return cents < 0 ? `−${formatted}` : formatted;
}

// Parse Belgian-formatted amount string to cents
export function parseAmount(str: string): number | null {
  // Remove € symbol, whitespace, convert comma to dot
  const cleaned = str
    .replace(/€/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")   // thousands sep
    .replace(",", ".");    // decimal sep
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return Math.round(num * 100);
}

export function formatMonth(month: string): string {
  // "2026-08" → "August 2026"
  const [year, m] = month.split("-");
  const date = new Date(parseInt(year), parseInt(m) - 1, 1);
  return date.toLocaleDateString("en-BE", { month: "long", year: "numeric" });
}

export function currentMonth(): string {
  // Returns YYYY-MM in Europe/Brussels timezone
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  return `${year}-${month}`;
}

export function nextMonth(month: string): string {
  // "2026-08" → "2026-09", "2026-12" → "2027-01". String math, never a Date.
  const [year, m] = month.split("-").map(Number);
  return m === 12
    ? `${year + 1}-01`
    : `${year}-${(m + 1).toString().padStart(2, "0")}`;
}

export function today(): string {
  // Returns YYYY-MM-DD
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDate(date: string): string {
  // "2026-08-01" → "Fri 1 Aug"
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-BE", { weekday: "short", day: "numeric", month: "short" });
}

export function formatShortDate(date: string): string {
  // "2026-08-01" → "1 Aug"
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-BE", { day: "numeric", month: "short" });
}

// True only for dates that exist. Rejects 2026-13-45, 31/2, 2026-02-30.
export function isRealDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;

/**
 * Accepts "today", "-1", "28/7", "28/7/2026", "2026-08-01" and "2026-8-1".
 * Returns YYYY-MM-DD, or null if the input is not a date that exists.
 * Callers must treat null as an error — never fall back to the raw text.
 */
export function parseRelativeDate(input: string, base: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === "today" || trimmed === "t") return base;

  // Relative to base: "-1" yesterday, "+2" two days out
  const rel = trimmed.match(/^([+-]\d{1,4})$/);
  if (rel) {
    const [year, month, day] = base.split("-").map(Number);
    const d = new Date(year, month - 1, day + parseInt(rel[1], 10));
    return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  // Day/month, year taken from base: "28/7", "28.7", "28-7"
  const dm = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (dm) {
    const year = Number(base.split("-")[0]);
    const [day, month] = [Number(dm[1]), Number(dm[2])];
    return isRealDate(year, month, day) ? iso(year, month, day) : null;
  }

  // Day/month/year: "28/7/2026"
  const dmy = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    const [day, month, year] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
    return isRealDate(year, month, day) ? iso(year, month, day) : null;
  }

  // ISO, tolerating single digits: "2026-08-01", "2026-8-1"
  const ymd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const [year, month, day] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
    return isRealDate(year, month, day) ? iso(year, month, day) : null;
  }

  return null;
}
