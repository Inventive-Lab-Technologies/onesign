import { NextResponse, type NextRequest } from "next/server";
import { requireBillingAccountAccess } from "@/lib/billing/route-auth";
import { parseUserId } from "@/lib/auth/resolve-data-owner";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireBillingAccountAccess(request);
  if (auth instanceof NextResponse) return auth;

  const addonId = parseUserId(params.id);
  if (!addonId) {
    return NextResponse.json({ error: "Invalid addon id" }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc("cancel_account_addon", {
    p_account_addon_id: addonId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, addon: data });
}
