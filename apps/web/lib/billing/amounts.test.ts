import { describe, expect, it } from "vitest";
import {
  getAddonUnitAmount,
  getPlanBaseAmount,
  majorAmountFromMinor,
  parseMajorAmountToMinor,
} from "@/lib/billing/amounts";
import type { AddonTemplate, PlanTemplate } from "@signage/types";

const addon = {
  monthly_price_cents: 500,
  monthly_price_gbp_cents: 400,
  monthly_price_eur_cents: 450,
  monthly_price_bdt_paisa: 50_000,
} satisfies Pick<
  AddonTemplate,
  | "monthly_price_cents"
  | "monthly_price_gbp_cents"
  | "monthly_price_eur_cents"
  | "monthly_price_bdt_paisa"
>;

describe("billing amounts", () => {
  it("picks addon unit amount by currency", () => {
    expect(getAddonUnitAmount(addon, "USD")).toBe(500);
    expect(getAddonUnitAmount(addon, "BDT")).toBe(50_000);
  });

  it("parses major display amounts into minor units", () => {
    expect(parseMajorAmountToMinor("12.5")).toBe(1250);
    expect(parseMajorAmountToMinor("500")).toBe(50_000);
    expect(parseMajorAmountToMinor("")).toBeNull();
  });

  it("formats minor units back to major display strings", () => {
    expect(majorAmountFromMinor(1250)).toBe("12.5");
    expect(majorAmountFromMinor(50000)).toBe("500");
  });

  it("reads plan base amount for a currency", () => {
    const plan = {
      monthly_price_cents: 900,
      monthly_price_gbp_cents: 700,
      monthly_price_eur_cents: 800,
      monthly_price_bdt_paisa: 90_000,
    } as PlanTemplate;
    expect(getPlanBaseAmount(plan, "BDT")).toBe(90_000);
    expect(getPlanBaseAmount(null, "USD")).toBeNull();
  });
});
