import { NextResponse, type NextRequest } from "next/server";
import { parseUserId } from "@/lib/auth/resolve-data-owner";
import { getRouteHandlerStaffAuth } from "@/lib/auth/route-handler-staff";
import { isStaffWriter } from "@/lib/auth/staff-utils";
import {
  type ClientProvisioningInput,
  provisioningSummary,
  resolveClientProvisioning,
} from "@/lib/admin/client-provisioning";
import { applyManualBillingAfterProvision } from "@/lib/billing/manual-billing";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PlanTemplate } from "@signage/types";

export const runtime = "nodejs";

async function loadActivePlanCatalog(): Promise<PlanTemplate[]> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("list_active_plans");
  if (error) {
    throw new Error(error.message);
  }
  return (data as PlanTemplate[]) ?? [];
}

export async function POST(request: NextRequest) {
  const { user, staff, supabase } = await getRouteHandlerStaffAuth();
  if (!user || !staff || !isStaffWriter(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    userId?: string;
    provisioning?: ClientProvisioningInput;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = parseUserId(body.userId);
  if (!userId) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  if (!body.provisioning?.mode) {
    return NextResponse.json({ error: "provisioning.mode is required" }, { status: 400 });
  }

  let plans: PlanTemplate[];
  try {
    plans = await loadActivePlanCatalog();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load plan catalog" },
      { status: 500 },
    );
  }

  const provisioning = resolveClientProvisioning(plans, body.provisioning);
  if ("error" in provisioning) {
    return NextResponse.json({ error: provisioning.error }, { status: 400 });
  }

  // Prefer the staff-authenticated RPC when available (migration 00118).
  const { error: provisionError } = await supabase.rpc("admin_provision_client", {
    p_user_id: userId,
    p_device_limit: provisioning.deviceLimit,
    p_storage_limit_bytes: provisioning.storageLimitBytes,
    p_trial_ends_at: provisioning.trialEndsAt,
    p_plan_kind: provisioning.planKind,
    p_plan_template_id: provisioning.planTemplateId,
  });

  if (provisionError) {
    // Fallback before migration 00118: change limits via staff RPC (auth.uid() present),
    // then set trial/plan fields with the service role (those columns are not staff-gated).
    const missingRpc =
      provisionError.message.includes("admin_provision_client") ||
      provisionError.code === "PGRST202" ||
      provisionError.code === "42883";

    if (!missingRpc) {
      return NextResponse.json({ error: provisionError.message }, { status: 400 });
    }

    const { error: limitsError } = await supabase.rpc("admin_update_plan", {
      p_user_id: userId,
      p_device_limit: provisioning.deviceLimit,
      p_storage_limit_bytes: provisioning.storageLimitBytes,
      p_active_device_ids: null,
    });

    if (limitsError) {
      return NextResponse.json({ error: limitsError.message }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        trial_ends_at: provisioning.trialEndsAt,
        plan_kind: provisioning.planKind,
        plan_template_id: provisioning.planTemplateId,
      })
      .eq("id", userId);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    const { error: syncError } = await admin.rpc("sync_user_app_metadata", { p_user_id: userId });
    if (syncError) {
      return NextResponse.json({ error: syncError.message }, { status: 500 });
    }
  }

  let invoiceNumber: string | null = null;
  let addonCount = 0;

  if (body.provisioning.billing) {
    try {
      const result = await applyManualBillingAfterProvision({
        supabase,
        accountId: userId,
        provisioning,
        plans,
        billing: body.provisioning.billing,
      });
      invoiceNumber = result.invoice?.invoice_number ?? null;
      addonCount = result.addons.length;
    } catch (err) {
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "Plan updated but billing failed",
          provisioning,
        },
        { status: 400 },
      );
    }
  }

  const summary = provisioningSummary(provisioning);
  const extras = [
    invoiceNumber ? `Invoice ${invoiceNumber} created` : null,
    addonCount > 0 ? `${addonCount} addon${addonCount === 1 ? "" : "s"} applied` : null,
  ].filter(Boolean);

  return NextResponse.json({
    ok: true,
    provisioning,
    invoiceNumber,
    addonCount,
    message: extras.length > 0 ? `Plan updated to ${summary}. ${extras.join(". ")}.` : `Plan updated to ${summary}.`,
  });
}
