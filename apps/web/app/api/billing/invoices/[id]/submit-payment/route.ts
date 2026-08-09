import { NextResponse, type NextRequest } from "next/server";
import type { BillingPaymentMethod } from "@signage/types";
import { requireBillingAccountAccess } from "@/lib/billing/route-auth";
import { parseUserId } from "@/lib/auth/resolve-data-owner";

export const runtime = "nodejs";

const METHODS = new Set<BillingPaymentMethod>([
  "bkash",
  "nagad",
  "bank",
  "stripe",
  "cash",
  "other",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireBillingAccountAccess(request);
  if (auth instanceof NextResponse) return auth;

  const invoiceId = parseUserId(params.id);
  if (!invoiceId) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }

  let body: { paymentMethod?: string; paymentReference?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const paymentMethod = body.paymentMethod as BillingPaymentMethod | undefined;
  if (!paymentMethod || !METHODS.has(paymentMethod)) {
    return NextResponse.json({ error: "Select a payment method" }, { status: 400 });
  }

  const paymentReference = body.paymentReference?.trim() ?? "";
  if (paymentReference.length < 3) {
    return NextResponse.json(
      { error: "Enter a payment reference (at least 3 characters)" },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supabase.rpc("submit_invoice_payment", {
    p_invoice_id: invoiceId,
    p_payment_method: paymentMethod,
    p_payment_reference: paymentReference,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    invoice: data,
    message: "Payment details submitted. We’ll confirm once verified.",
  });
}
