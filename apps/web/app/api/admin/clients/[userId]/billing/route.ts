import { NextResponse, type NextRequest } from "next/server";
import { getRouteHandlerStaffAuth } from "@/lib/auth/route-handler-staff";
import { isStaffWriter } from "@/lib/auth/staff-utils";
import { parseUserId } from "@/lib/auth/resolve-data-owner";
import { loadBillingSummary } from "@/lib/billing/manual-billing";
import type { BillingPaymentMethod } from "@signage/types";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: { userId: string } },
) {
  const { user, staff, supabase } = await getRouteHandlerStaffAuth();
  if (!user || !staff) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = parseUserId(params.userId);
  if (!userId) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  const summary = await loadBillingSummary(supabase, userId);
  return NextResponse.json(summary);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  const { user, staff, supabase } = await getRouteHandlerStaffAuth();
  if (!user || !staff || !isStaffWriter(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = parseUserId(params.userId);
  if (!userId) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  let body: {
    action?: "verify_payment" | "unverify_payment" | "mark_invoice_paid" | "add_addon" | "cancel_addon";
    invoiceId?: string;
    addonTemplateId?: string;
    accountAddonId?: string;
    quantity?: number;
    paymentMethod?: BillingPaymentMethod;
    paymentReference?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "verify_payment" || body.action === "unverify_payment") {
    const { data, error } = await supabase.rpc("admin_set_payment_verified", {
      p_account_id: userId,
      p_verified: body.action === "verify_payment",
      p_payment_method: body.paymentMethod ?? null,
      p_payment_reference: body.paymentReference ?? null,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, billing: data });
  }

  if (body.action === "mark_invoice_paid") {
    const invoiceId = parseUserId(body.invoiceId);
    if (!invoiceId) {
      return NextResponse.json({ error: "Invalid invoiceId" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("admin_mark_invoice_paid", {
      p_invoice_id: invoiceId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, invoice: data });
  }

  if (body.action === "add_addon") {
    const addonTemplateId = parseUserId(body.addonTemplateId);
    if (!addonTemplateId) {
      return NextResponse.json({ error: "Invalid addonTemplateId" }, { status: 400 });
    }
    const { addAddonWithInvoice } = await import("@/lib/billing/manual-billing");
    try {
      const result = await addAddonWithInvoice({
        supabase,
        accountId: userId,
        addonTemplateId,
        quantity: body.quantity,
        createInvoice: true,
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not add addon" },
        { status: 400 },
      );
    }
  }

  if (body.action === "cancel_addon") {
    const accountAddonId = parseUserId(body.accountAddonId);
    if (!accountAddonId) {
      return NextResponse.json({ error: "Invalid accountAddonId" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("cancel_account_addon", {
      p_account_addon_id: accountAddonId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, addon: data });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
