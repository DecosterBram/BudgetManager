"use server";

import { revalidatePath } from "next/cache";
import { ensureDb } from "@/lib/db/ensure-ready";
import {
  insertCategory,
  setCategoryArchived,
  deleteMerchantRule,
} from "@/lib/db/queries/categories";
import { today } from "@/lib/format";
import { z } from "zod/v4";

const CategorySchema = z.object({
  name:    z.string().trim().min(1, "Name is required").max(40),
  kind:    z.enum(["need", "want", "save"]),
  groupId: z.number().int().positive(),
});

const IdSchema = z.number().int().positive();

function revalidate() {
  revalidatePath("/settings");
  revalidatePath("/plan");
  revalidatePath("/month");
  revalidatePath("/capture");
}

export async function createCategory(raw: unknown) {
  ensureDb();
  const parsed = CategorySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  try {
    insertCategory(parsed.data);
  } catch (err) {
    // categories.name carries a UNIQUE constraint
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return { ok: false as const, error: `"${parsed.data.name}" already exists` };
    }
    throw err;
  }

  revalidate();
  return { ok: true as const };
}

export async function archiveCategory(rawId: unknown) {
  ensureDb();
  setCategoryArchived(IdSchema.parse(rawId), today());
  revalidate();
  return { ok: true as const };
}

export async function restoreCategory(rawId: unknown) {
  ensureDb();
  setCategoryArchived(IdSchema.parse(rawId), null);
  revalidate();
  return { ok: true as const };
}

export async function removeMerchantRule(rawId: unknown) {
  ensureDb();
  deleteMerchantRule(IdSchema.parse(rawId));
  revalidatePath("/settings");
  return { ok: true as const };
}
