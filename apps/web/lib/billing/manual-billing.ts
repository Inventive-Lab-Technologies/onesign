import type {
  AccountAddon,
  AccountBilling,
  AddonTemplate,
  BillingInvoice,
  BillingInvoiceLine,
  BillingPaymentMethod,
  PlanTemplate,
} from "@signage/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAddonUnitAmount,
  getPlanBaseAmount,
} from "@/lib/billing/amounts";
import type { PlanCurrency } from "@/lib/plan-currency";
import type { ResolvedClientProvisioning } from "@/lib/admin/client-provisioning";

export type BillingAddonSelection = {
  addonTemplateId: string;
  quantity?: number;
};

export type ManualBillingInput = {
  /** When true, create an open invoice for the activation. */
  createInvoice?: boolean;
  currency?: PlanCurrency;
  /** Override monthly base amount (required for custom; optional override for catalog). */
  monthlyAmountCents?: number | null;
  addons?: BillingAddonSelection[];
  notes?: string | null;
  dueDays?: number;
};

export type InvoiceLineInput = {
  kind: "plan" | "addon" | "custom" | "credit";
  description: string;
  quantity: number;
  unit_amount_cents: number;
  amount_cents: number;
  addon_template_id?: string | null;
  account_addon_id?: string | null;
  plan_template_id?: string | null;
};

export type BillingSummary = {
  billing: AccountBilling | null;
  addons: Array<AccountAddon & { addon: AddonTemplate | null }>;
  invoices: Array<BillingInvoice & { lines: BillingInvoiceLine[] }>;
  catalogAddons: AddonTemplate[];
};

function isMissingRelationError(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("account_billing") ||
    lower.includes("addon_templates") ||
    lower.includes("billing_invoices") ||
    lower.includes("account_addons") ||
    lower.includes("could not find the table") ||
    lower.includes("does not exist") ||
    lower.includes("pgrst") ||
    lower.includes("42883")
  );
}

export async function loadBillingSummary(
  supabase: SupabaseClient,
  accountId: string,
): Promise<BillingSummary> {
  const empty: BillingSummary = {
    billing: null,
    addons: [],
    invoices: [],
    catalogAddons: [],
  };

  const [billingRes, addonsRes, invoicesRes, catalogRes] = await Promise.all([
    supabase.from("account_billing").select("*").eq("account_id", accountId).maybeSingle(),
    supabase
      .from("account_addons")
      .select("*")
      .eq("account_id", accountId)
      .eq("status", "active")
      .order("started_at", { ascending: false }),
    supabase
      .from("billing_invoices")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase.rpc("list_active_addons"),
  ]);

  if (
    billingRes.error &&
    isMissingRelationError(billingRes.error.message)
  ) {
    return empty;
  }

  const catalogAddons = ((catalogRes.data as AddonTemplate[]) ?? []).filter(Boolean);
  const catalogById = new Map(catalogAddons.map((addon) => [addon.id, addon]));

  // Also load template rows for inactive addons still attached to the account.
  const activeAddons = (addonsRes.data as AccountAddon[] | null) ?? [];
  const missingTemplateIds = activeAddons
    .map((row) => row.addon_template_id)
    .filter((id) => !catalogById.has(id));

  if (missingTemplateIds.length > 0) {
    const { data: extraTemplates } = await supabase
      .from("addon_templates")
      .select("*")
      .in("id", missingTemplateIds);
    for (const template of (extraTemplates as AddonTemplate[] | null) ?? []) {
      catalogById.set(template.id, template);
    }
  }

  const invoices = (invoicesRes.data as BillingInvoice[] | null) ?? [];
  const invoiceIds = invoices.map((invoice) => invoice.id);
  let linesByInvoice = new Map<string, BillingInvoiceLine[]>();

  if (invoiceIds.length > 0) {
    const { data: lines } = await supabase
      .from("billing_invoice_lines")
      .select("*")
      .in("invoice_id", invoiceIds)
      .order("sort_order", { ascending: true });

    linesByInvoice = ((lines as BillingInvoiceLine[] | null) ?? []).reduce((map, line) => {
      const list = map.get(line.invoice_id) ?? [];
      list.push(line);
      map.set(line.invoice_id, list);
      return map;
    }, new Map<string, BillingInvoiceLine[]>());
  }

  return {
    billing: (billingRes.data as AccountBilling | null) ?? null,
    addons: activeAddons.map((row) => ({
      ...row,
      addon: catalogById.get(row.addon_template_id) ?? null,
    })),
    invoices: invoices.map((invoice) => ({
      ...invoice,
      lines: linesByInvoice.get(invoice.id) ?? [],
    })),
    catalogAddons,
  };
}

export async function applyManualBillingAfterProvision(input: {
  supabase: SupabaseClient;
  accountId: string;
  provisioning: ResolvedClientProvisioning;
  plans: PlanTemplate[];
  billing: ManualBillingInput;
}): Promise<{ invoice: BillingInvoice | null; addons: AccountAddon[] }> {
  const { supabase, accountId, provisioning, plans, billing } = input;
  const currency = billing.currency ?? "USD";
  const createInvoice = billing.createInvoice !== false && provisioning.mode !== "trial";

  const selectedPlan =
    provisioning.planTemplateId != null
      ? plans.find((plan) => plan.id === provisioning.planTemplateId) ?? null
      : null;

  const catalogAmount = getPlanBaseAmount(selectedPlan, currency);
  const monthlyAmountCents =
    billing.monthlyAmountCents != null
      ? billing.monthlyAmountCents
      : provisioning.mode === "custom"
        ? null
        : catalogAmount;

  if (createInvoice && (monthlyAmountCents == null || monthlyAmountCents < 0)) {
    throw new Error("Enter a monthly amount for this activation");
  }

  const { error: billingError } = await supabase.rpc("admin_upsert_account_billing", {
    p_account_id: accountId,
    p_currency: currency,
    p_custom_monthly_amount_cents:
      provisioning.mode === "custom" ||
      (monthlyAmountCents != null &&
        catalogAmount != null &&
        monthlyAmountCents !== catalogAmount)
        ? monthlyAmountCents
        : billing.monthlyAmountCents ?? null,
    p_base_device_limit: provisioning.deviceLimit,
    p_base_storage_limit_bytes: provisioning.storageLimitBytes,
    p_notes: billing.notes ?? null,
  });

  if (billingError) {
    if (isMissingRelationError(billingError.message)) {
      throw new Error(
        "Billing tables are not migrated yet. Apply migration 00123_manual_billing_addons.sql.",
      );
    }
    throw new Error(billingError.message);
  }

  // Recompute after base upsert so later addons start from the provisioned base.
  await supabase.rpc("recompute_account_limits_from_billing", {
    p_account_id: accountId,
  });

  const createdAddons: AccountAddon[] = [];
  const addonLines: InvoiceLineInput[] = [];
  const selections = billing.addons ?? [];

  if (selections.length > 0) {
    const { data: catalogData, error: catalogError } = await supabase.rpc("list_active_addons");
    if (catalogError) {
      throw new Error(catalogError.message);
    }
    const catalog = (catalogData as AddonTemplate[]) ?? [];
    const byId = new Map(catalog.map((addon) => [addon.id, addon]));

    for (const selection of selections) {
      const template = byId.get(selection.addonTemplateId);
      if (!template) {
        throw new Error("Selected addon is not available");
      }
      const quantity = Math.max(1, Math.floor(selection.quantity ?? 1));
      const unit = getAddonUnitAmount(template, currency);

      const { data: addonRow, error: addonError } = await supabase.rpc("add_account_addon", {
        p_account_id: accountId,
        p_addon_template_id: template.id,
        p_quantity: quantity,
        p_unit_amount_cents: unit,
        p_currency: currency,
      });

      if (addonError) {
        throw new Error(addonError.message);
      }

      const accountAddon = addonRow as AccountAddon;
      createdAddons.push(accountAddon);
      addonLines.push({
        kind: "addon",
        description: `${template.name}${quantity > 1 ? ` × ${quantity}` : ""}`,
        quantity,
        unit_amount_cents: unit,
        amount_cents: unit * quantity,
        addon_template_id: template.id,
        account_addon_id: accountAddon.id,
      });
    }
  }

  if (!createInvoice) {
    return { invoice: null, addons: createdAddons };
  }

  const lines: InvoiceLineInput[] = [
    {
      kind: provisioning.mode === "custom" ? "custom" : "plan",
      description:
        provisioning.mode === "custom"
          ? "Custom plan"
          : `${provisioning.planName ?? "Plan"} (monthly)`,
      quantity: 1,
      unit_amount_cents: monthlyAmountCents ?? 0,
      amount_cents: monthlyAmountCents ?? 0,
      plan_template_id: provisioning.planTemplateId,
    },
    ...addonLines,
  ];

  const { data: invoiceRow, error: invoiceError } = await supabase.rpc("create_billing_invoice", {
    p_account_id: accountId,
    p_currency: currency,
    p_source: "manual_activation",
    p_notes: billing.notes ?? null,
    p_due_days: billing.dueDays ?? 7,
    p_lines: lines,
  });

  if (invoiceError) {
    throw new Error(invoiceError.message);
  }

  return { invoice: invoiceRow as BillingInvoice, addons: createdAddons };
}

export async function addAddonWithInvoice(input: {
  supabase: SupabaseClient;
  accountId: string;
  addonTemplateId: string;
  quantity?: number;
  /** When true (default if payment verified), create an open invoice for the addon. */
  createInvoice?: boolean;
}): Promise<{ addon: AccountAddon; invoice: BillingInvoice | null }> {
  const { supabase, accountId, addonTemplateId } = input;
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1));

  const { data: billingRow } = await supabase
    .from("account_billing")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();

  const billing = billingRow as AccountBilling | null;
  const currency = (billing?.currency ?? "USD") as PlanCurrency;
  const paymentVerified = Boolean(billing?.payment_verified_at);
  const shouldInvoice = input.createInvoice ?? paymentVerified;

  const { data: catalogData, error: catalogError } = await supabase.rpc("list_active_addons");
  if (catalogError) throw new Error(catalogError.message);
  const template = ((catalogData as AddonTemplate[]) ?? []).find((row) => row.id === addonTemplateId);
  if (!template) throw new Error("Addon is not available");

  const unit = getAddonUnitAmount(template, currency);
  const { data: addonRow, error: addonError } = await supabase.rpc("add_account_addon", {
    p_account_id: accountId,
    p_addon_template_id: template.id,
    p_quantity: quantity,
    p_unit_amount_cents: unit,
    p_currency: currency,
  });
  if (addonError) throw new Error(addonError.message);

  const addon = addonRow as AccountAddon;
  if (!shouldInvoice) {
    return { addon, invoice: null };
  }

  const { data: invoiceRow, error: invoiceError } = await supabase.rpc("create_billing_invoice", {
    p_account_id: accountId,
    p_currency: currency,
    p_source: "addon_change",
    p_notes: null,
    p_due_days: 7,
    p_lines: [
      {
        kind: "addon",
        description: `${template.name}${quantity > 1 ? ` × ${quantity}` : ""}`,
        quantity,
        unit_amount_cents: unit,
        amount_cents: unit * quantity,
        addon_template_id: template.id,
        account_addon_id: addon.id,
      },
    ],
  });
  if (invoiceError) throw new Error(invoiceError.message);

  return { addon, invoice: invoiceRow as BillingInvoice };
}

export const PAYMENT_METHOD_LABELS: Record<BillingPaymentMethod, string> = {
  bkash: "bKash",
  nagad: "Nagad",
  bank: "Bank transfer",
  stripe: "Card (Stripe)",
  cash: "Cash",
  other: "Other",
};
