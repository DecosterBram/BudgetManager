export const dynamic = "force-dynamic";

import { ensureDb } from "@/lib/db/ensure-ready";
import { getActiveCategories, getMerchantRules } from "@/lib/db/queries/categories";
import { CaptureClient } from "@/components/capture/capture-client";

export default function CapturePage() {
  ensureDb();

  const categories = getActiveCategories();
  // Learned rules double as the description type-ahead, ranked by hit count
  const pastDescriptions = getMerchantRules().map((r) => ({
    description: r.pattern,
    categoryId: r.categoryId,
    count: r.hitCount,
  }));

  return <CaptureClient categories={categories} pastDescriptions={pastDescriptions} />;
}
