import type { Goal } from "./types";

export const GOALS: Goal[] = [
  {
    id: 1,
    name: "Emergency fund",
    targetCents: 600000,   // € 6.000
    savedCents: 220000,    // € 2.200
    priority: "high",
    targetDate: "2027-06-01",
    achievedAt: null,
  },
  {
    id: 2,
    name: "New laptop",
    targetCents: 250000,   // € 2.500
    savedCents: 75000,     // € 750
    priority: "medium",
    targetDate: "2026-12-01",
    achievedAt: null,
  },
  {
    id: 3,
    name: "Holiday 2027",
    targetCents: 300000,   // € 3.000
    savedCents: 0,
    priority: "low",
    targetDate: "2027-07-01",
    achievedAt: null,
  },
];
