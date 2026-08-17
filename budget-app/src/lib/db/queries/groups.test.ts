import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";

// Point the DB layer at a throwaway file before it is imported.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-test-"));
const dbPath = path.join(tmpDir, "test.db");
process.env.BUDGET_DB_PATH = dbPath;

const { migrateAndSeed } = await import("../migrate");
const { getBudgetLinesForMonth } = await import("./months");
const { getActiveGroups, getAllGroups } = await import("./groups");
const { getAllCategories, setCategoryArchived } = await import("./categories");

migrateAndSeed();

describe("an archived group's surviving budget lines stay reachable", () => {
  it("is excluded from getActiveGroups but still present in getAllGroups, with its line intact", () => {
    const line = getBudgetLinesForMonth("2026-08")[0];
    const groupId = line.categoryGroupId;

    // Archive every active category in this group — the precondition the app
    // enforces before a group itself can be archived (a later task's feature).
    for (const c of getAllCategories()) {
      if (c.groupId === groupId && !c.archivedAt) setCategoryArchived(c.id, "2026-08-11");
    }

    // Archive the group directly. There is no query for this yet (group archiving
    // lands in a later task) — this simulates its end state via raw SQL.
    const sqlite = new Database(dbPath);
    sqlite.prepare("UPDATE category_groups SET archived_at = ? WHERE id = ?").run("2026-08-11", groupId);
    sqlite.close();

    expect(getActiveGroups().some((g) => g.id === groupId)).toBe(false);
    expect(getAllGroups().some((g) => g.id === groupId)).toBe(true);

    // The budget line for the now-archived group is untouched and still points at it —
    // this is exactly what a page iterating getActiveGroups() would silently drop.
    const linesAfter = getBudgetLinesForMonth("2026-08");
    const stillThere = linesAfter.find((l) => l.id === line.id);
    expect(stillThere).toBeDefined();
    expect(stillThere!.categoryGroupId).toBe(groupId);
  });
});
