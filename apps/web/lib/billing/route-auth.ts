import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { workspaceRoleHasPermission } from "@signage/types";
import { getRouteHandlerClientAuth } from "@/lib/auth/route-handler-client";
import { fetchAccountContext, type AccountContext } from "@/lib/workspace/account-context";

export type BillingAccountAuth = {
  supabase: SupabaseClient;
  user: User;
  account: AccountContext;
};

function canAccessBilling(account: AccountContext): boolean {
  if (account.canAdminAccount || account.isAccountOwner) return true;
  return account.workspaces.some((workspace) =>
    workspaceRoleHasPermission(workspace.role, "access_billing", workspace.permissions),
  );
}

/** Cookie/Bearer session + account billing access (owner / account_admin / access_billing). */
export async function requireBillingAccountAccess(
  request: NextRequest,
): Promise<BillingAccountAuth | NextResponse> {
  const ctx = await getRouteHandlerClientAuth(request);
  if (!ctx.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await fetchAccountContext(ctx.supabase, ctx.user.id);
  if (!canAccessBilling(account)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return {
    supabase: ctx.supabase,
    user: ctx.user,
    account,
  };
}
