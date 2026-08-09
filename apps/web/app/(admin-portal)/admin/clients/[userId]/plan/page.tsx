import { notFound } from "next/navigation";
import { CreditCard } from "lucide-react";
import { AdminClientPlanForm } from "@/components/admin/admin-client-plan-form";
import { AdminClientPlanBadge } from "@/components/admin/admin-client-plan-badge";
import { AdminClientBillingPanel } from "@/components/admin/admin-client-billing-panel";
import { getAdminClientEntry } from "@/lib/admin/get-client-entry";
import { getServerStaffAuth } from "@/lib/auth/staff";
import type { PlanTemplate } from "@signage/types";

export default async function AdminClientPlanPage({
  params,
}: {
  params: { userId: string };
}) {
  const ctx = await getServerStaffAuth();
  if (!ctx) notFound();

  const client = await getAdminClientEntry(ctx.supabase, params.userId);
  if (!client) notFound();

  const { data: plansData, error: plansError } = await ctx.supabase.rpc("list_active_plans");
  if (plansError) {
    throw new Error(plansError.message);
  }
  const plans = (plansData as PlanTemplate[]) ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/90 bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">Subscription plan</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Upgrade or downgrade this client’s catalog plan, start a trial, or set custom limits.
              Set a monthly amount and addons to create an invoice on save.
            </p>
          </div>
          <AdminClientPlanBadge row={client} plans={plans} />
        </div>

        <AdminClientPlanForm client={client} plans={plans} submitLabel="Save subscription plan" />
      </div>

      <AdminClientBillingPanel userId={client.id} />
    </div>
  );
}
