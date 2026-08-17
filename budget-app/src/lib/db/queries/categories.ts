import { db } from "../index";
import { categories, merchantRules } from "../schema";
import { eq, asc, isNull, sql } from "drizzle-orm";

export function getActiveCategories() {
  return db
    .select()
    .from(categories)
    .where(isNull(categories.archivedAt))
    .orderBy(asc(categories.sortOrder))
    .all();
}

export function getAllCategories() {
  return db.select().from(categories).orderBy(asc(categories.sortOrder)).all();
}

export function getMerchantRules() {
  return db
    .select({
      id:         merchantRules.id,
      pattern:    merchantRules.pattern,
      categoryId: merchantRules.categoryId,
      hitCount:   merchantRules.hitCount,
      lastUsedOn: merchantRules.lastUsedOn,
      categoryName: categories.name,
    })
    .from(merchantRules)
    .innerJoin(categories, eq(merchantRules.categoryId, categories.id))
    .orderBy(merchantRules.hitCount)
    .all();
}

export function upsertMerchantRule(pattern: string, categoryId: number) {
  const today = new Date().toISOString().slice(0, 10);
  return db
    .insert(merchantRules)
    .values({ pattern, categoryId, hitCount: 1, lastUsedOn: today })
    .onConflictDoUpdate({
      target: merchantRules.pattern,
      set: {
        categoryId,
        hitCount: sql`${merchantRules.hitCount} + 1`,
        lastUsedOn: today,
      },
    })
    .run();
}

export function deleteMerchantRule(id: number) {
  return db.delete(merchantRules).where(eq(merchantRules.id, id)).run();
}

export function insertCategory(data: {
  name: string;
  kind: "need" | "want" | "save";
  groupId: number;
}) {
  const max = db
    .select({ value: sql<number>`COALESCE(MAX(${categories.sortOrder}), 0)` })
    .from(categories)
    .where(eq(categories.groupId, data.groupId))
    .get();

  return db
    .insert(categories)
    .values({ ...data, sortOrder: (max?.value ?? 0) + 1 })
    .returning({ id: categories.id })
    .get();
}

// Categories are archived, never deleted — history depends on them.
export function setCategoryArchived(id: number, archivedAt: string | null) {
  return db.update(categories).set({ archivedAt }).where(eq(categories.id, id)).run();
}
