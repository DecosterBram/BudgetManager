export const dynamic = "force-dynamic";

import { ensureDb } from "@/lib/db/ensure-ready";
import { getAllCategories, getMerchantRules } from "@/lib/db/queries/categories";
import { SettingsClient } from "@/components/settings/settings-client";

export default function SettingsPage() {
  ensureDb();

  return (
    <SettingsClient
      categories={getAllCategories()}
      rules={getMerchantRules()}
    />
  );
}
