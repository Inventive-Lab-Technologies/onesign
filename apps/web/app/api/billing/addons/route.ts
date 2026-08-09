import { NextResponse, type NextRequest } from "next/server";
import { addAddonWithInvoice } from "@/lib/billing/manual-billing";
import { requireBillingAccountAccess } from "@/lib/billing/route-auth";
import { parseUserId } from "@/lib/auth/resolve-data-owner";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireBillingAccountAccess(request);
  if (auth instanceof NextResponse) return auth;

  let body: { addonTemplateId?: string; quantity?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const addonTemplateId = parseUserId(body.addonTemplateId);
  if (!addonTemplateId) {
    return NextResponse.json({ error: "Invalid addonTemplateId" }, { status: 400 });
  }

  try {
    const result = await addAddonWithInvoice({
      supabase: auth.supabase,
      accountId: auth.account.accountOwnerId,
      addonTemplateId,
      quantity: body.quantity,
      createInvoice: true,
    });

    return NextResponse.json({
      ok: true,
      addon: result.addon,
      invoice: result.invoice,
      message: result.invoice
        ? `Addon added. Invoice ${result.invoice.invoice_number} created.`
        : "Addon added.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not add addon" },
      { status: 400 },
    );
  }
}
