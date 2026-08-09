import { NextResponse, type NextRequest } from "next/server";
import { loadBillingSummary } from "@/lib/billing/manual-billing";
import { requireBillingAccountAccess } from "@/lib/billing/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireBillingAccountAccess(request);
  if (auth instanceof NextResponse) return auth;

  const summary = await loadBillingSummary(auth.supabase, auth.account.accountOwnerId);

  return NextResponse.json({
    accountId: auth.account.accountOwnerId,
    ...summary,
  });
}
