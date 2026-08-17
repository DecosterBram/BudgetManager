import { db } from "../index";
import { categoryGroups, categories } from "../schema";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

export function getActiveGroups() {
  return db
    .select()
    .from(categoryGroups)
    .where(isNull(categoryGroups.archivedAt))
    .orderBy(asc(categoryGroups.sortOrder))
    .all();
}

export function getAllGroups() {
  return db.select().from(categoryGroups).orderBy(asc(categoryGroups.sortOrder)).all();
}

/** Active categories per group — what the Settings tab shows, and what blocks archiving. */
export function getGroupsWithCounts() {
  return db
    .select({
      id:         categoryGroups.id,
      name:       categoryGroups.name,
      sortOrder:  categoryGroups.sortOrder,
      archivedAt: categoryGroups.archivedAt,
      activeCategories: sql<number>`(
        SELECT COUNT(*) FROM categories c
        WHERE c.group_id = ${categoryGroups.id} AND c.archived_at IS NULL
      )`.as("active_categories"),
    })
    .from(categoryGroups)
    .orderBy(asc(categoryGroups.sortOrder))
    .all();
}

export function countActiveCategoriesInGroup(groupId: number) {
  const row = db
    .select({ n: sql<number>`COUNT(*)` })
    .from(categories)
    .where(and(eq(categories.groupId, groupId), isNull(categories.archivedAt)))
    .get();
  return row?.n ?? 0;
}
