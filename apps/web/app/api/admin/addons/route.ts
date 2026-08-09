import { NextResponse, type NextRequest } from "next/server";
import { getRouteHandlerStaffAuth } from "@/lib/auth/route-handler-staff";
import { isStaffWriter } from "@/lib/auth/staff-utils";
import type { AddonKind, AddonTemplate } from "@signage/types";

export const runtime = "nodejs";

type UpsertBody = {
  id?: string | null;
  name?: string;
  description?: string;
  kind?: AddonKind;
  deviceDelta?: number;
  storageDeltaBytes?: number;
  monthlyPriceCents?: number;
  monthlyPriceGbpCents?: number;
  monthlyPriceEurCents?: number;
  monthlyPriceBdtPaisa?: number;
  isActive?: boolean;
  sortOrder?: number;
};

function isNonNegInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export async function GET() {
  const { user, staff, supabase } = await getRouteHandlerStaffAuth();
  if (!user || !staff) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("admin_list_addons");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ addons: (data as AddonTemplate[]) ?? [] });
}

export async function POST(request: NextRequest) {
  const { user, staff, supabase } = await getRouteHandlerStaffAuth();
  if (!user || !staff || !isStaffWriter(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: UpsertBody;
  try {
    body = (await request.json()) as UpsertBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Addon name is required" }, { status: 400 });
  }

  if (body.kind !== "extra_screen" && body.kind !== "extra_storage") {
    return NextResponse.json({ error: "Invalid addon kind" }, { status: 400 });
  }

  const deviceDelta = body.deviceDelta ?? 0;
  const storageDeltaBytes = body.storageDeltaBytes ?? 0;
  if (!isNonNegInt(deviceDelta) || !isNonNegInt(storageDeltaBytes)) {
    return NextResponse.json({ error: "Invalid capacity deltas" }, { status: 400 });
  }
  if (deviceDelta === 0 && storageDeltaBytes === 0) {
    return NextResponse.json({ error: "Addon must add screens or storage" }, { status: 400 });
  }

  for (const key of [
    "monthlyPriceCents",
    "monthlyPriceGbpCents",
    "monthlyPriceEurCents",
    "monthlyPriceBdtPaisa",
  ] as const) {
    if (!isNonNegInt(body[key] ?? 0)) {
      return NextResponse.json({ error: "Prices must be non-negative integers" }, { status: 400 });
    }
  }

  const { data, error } = await supabase.rpc("admin_upsert_addon", {
    p_id: body.id ?? null,
    p_name: name,
    p_description: body.description?.trim() ?? "",
    p_kind: body.kind,
    p_device_delta: deviceDelta,
    p_storage_delta_bytes: storageDeltaBytes,
    p_monthly_price_cents: body.monthlyPriceCents ?? 0,
    p_monthly_price_gbp_cents: body.monthlyPriceGbpCents ?? 0,
    p_monthly_price_eur_cents: body.monthlyPriceEurCents ?? 0,
    p_monthly_price_bdt_paisa: body.monthlyPriceBdtPaisa ?? 0,
    p_is_active: body.isActive ?? true,
    p_sort_order: body.sortOrder ?? 0,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ addon: data as AddonTemplate });
}
