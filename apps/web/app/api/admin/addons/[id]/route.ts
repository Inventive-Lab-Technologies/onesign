import { NextResponse, type NextRequest } from "next/server";
import { getRouteHandlerStaffAuth } from "@/lib/auth/route-handler-staff";
import { isStaffWriter } from "@/lib/auth/staff-utils";
import { parseUserId } from "@/lib/auth/resolve-data-owner";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { user, staff, supabase } = await getRouteHandlerStaffAuth();
  if (!user || !staff || !isStaffWriter(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = parseUserId(params.id);
  if (!id) {
    return NextResponse.json({ error: "Invalid addon id" }, { status: 400 });
  }

  const { error } = await supabase.rpc("admin_delete_addon", { p_id: id });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
