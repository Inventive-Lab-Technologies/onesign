import { getServerStaffAuth } from "@/lib/auth/staff";
import { AdminAddonsManager } from "@/components/admin/admin-addons-manager";
import type { AddonTemplate } from "@signage/types";
import { notFound } from "next/navigation";

export default async function AdminAddonsPage() {
  const ctx = await getServerStaffAuth();
  if (!ctx) notFound();

  const { data, error } = await ctx.supabase.rpc("admin_list_addons");
  if (error) {
    // Migration not applied yet — show empty manager with a hint via empty state.
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          Addon catalog is unavailable until migration{" "}
          <code className="font-mono text-xs">00123_manual_billing_addons.sql</code> is applied.
          ({error.message})
        </div>
        <AdminAddonsManager addons={[]} />
      </div>
    );
  }

  return <AdminAddonsManager addons={(data as AddonTemplate[]) ?? []} />;
}
