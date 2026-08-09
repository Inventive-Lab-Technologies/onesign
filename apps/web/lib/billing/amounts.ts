import type { AddonTemplate, PlanTemplate } from "@signage/types";
import {
  type PlanCurrency,
  getPlanPricesForCurrency,
} from "@/lib/plan-currency";

export function getAddonUnitAmount(
  addon: Pick<
    AddonTemplate,
    | "monthly_price_cents"
    | "monthly_price_gbp_cents"
    | "monthly_price_eur_cents"
    | "monthly_price_bdt_paisa"
  >,
  currency: PlanCurrency,
): number {
  switch (currency) {
    case "GBP":
      return addon.monthly_price_gbp_cents;
    case "EUR":
      return addon.monthly_price_eur_cents;
    case "BDT":
      return addon.monthly_price_bdt_paisa;
    default:
      return addon.monthly_price_cents;
  }
}

export function getPlanBaseAmount(
  plan: PlanTemplate | null | undefined,
  currency: PlanCurrency,
): number | null {
  if (!plan) return null;
  return getPlanPricesForCurrency(plan, currency).monthlyMinor;
}

/** Parse a display major-unit amount string into minor units (cents/paisa). */
export function parseMajorAmountToMinor(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const amount = Number.parseFloat(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function majorAmountFromMinor(minor: number): string {
  const amount = minor / 100;
  if (Number.isInteger(amount)) return String(amount);
  return String(Number(amount.toFixed(2)));
}
