import type { PlanTemplate } from "@signage/types";
import {
  DEFAULT_TRIAL_DAYS,
  DEFAULT_TRIAL_DEVICE_LIMIT,
  DEFAULT_TRIAL_STORAGE_LIMIT_BYTES,
  MIN_STORAGE_LIMIT_BYTES,
} from "@/lib/plan-quota";

export const CLIENT_PLAN_TRIAL_VALUE = "__trial__";
export const CLIENT_PLAN_CUSTOM_VALUE = "__custom__";

export type ClientProvisioningMode = "catalog" | "trial" | "custom";

export interface ClientProvisioningBillingInput {
  /** Create an open invoice after activation (default true for non-trial). */
  createInvoice?: boolean;
  currency?: "USD" | "GBP" | "EUR" | "BDT";
  /** Monthly amount in minor units; overrides catalog price / required for custom. */
  monthlyAmountCents?: number | null;
  addons?: Array<{ addonTemplateId: string; quantity?: number }>;
  notes?: string | null;
  dueDays?: number;
}

export interface ClientProvisioningInput {
  mode: ClientProvisioningMode;
  planTemplateId?: string | null;
  trialDays?: number | null;
  deviceLimit?: number | null;
  storageLimitBytes?: number | null;
  billing?: ClientProvisioningBillingInput | null;
}

export interface ResolvedClientProvisioning {
  mode: ClientProvisioningMode;
  planTemplateId: string | null;
  planName: string | null;
  deviceLimit: number;
  storageLimitBytes: number;
  trialDays: number | null;
  trialEndsAt: string | null;
  planKind: "trial" | "standard" | "custom";
  skipTrial: boolean;
}

export function findSoloPlan(plans: PlanTemplate[]): PlanTemplate | undefined {
  return plans.find((plan) => plan.name.toLowerCase() === "solo") ?? plans[0];
}

export function computeTrialEndsAt(days: number, from = new Date()): string {
  const end = new Date(from.getTime());
  end.setUTCDate(end.getUTCDate() + days);
  return end.toISOString();
}

export function resolveClientProvisioning(
  plans: PlanTemplate[],
  input: ClientProvisioningInput,
): ResolvedClientProvisioning | { error: string } {
  if (input.mode === "catalog") {
    const planId = input.planTemplateId?.trim();
    if (!planId) {
      return { error: "Select a plan" };
    }
    const plan = plans.find((entry) => entry.id === planId);
    if (!plan) {
      return { error: "Selected plan is not available" };
    }
    return {
      mode: "catalog",
      planTemplateId: plan.id,
      planName: plan.name,
      deviceLimit: plan.device_limit,
      storageLimitBytes: plan.storage_limit_bytes,
      trialDays: null,
      trialEndsAt: null,
      planKind: "standard",
      skipTrial: true,
    };
  }

  if (input.mode === "trial") {
    const trialDays = Math.floor(input.trialDays ?? DEFAULT_TRIAL_DAYS);
    if (!Number.isFinite(trialDays) || trialDays < 1 || trialDays > 365) {
      return { error: "Trial length must be between 1 and 365 days" };
    }
    const solo = findSoloPlan(plans);
    return {
      mode: "trial",
      planTemplateId: solo?.id ?? null,
      planName: solo?.name ?? "Solo",
      deviceLimit: solo?.device_limit ?? DEFAULT_TRIAL_DEVICE_LIMIT,
      storageLimitBytes: solo?.storage_limit_bytes ?? DEFAULT_TRIAL_STORAGE_LIMIT_BYTES,
      trialDays,
      trialEndsAt: computeTrialEndsAt(trialDays),
      planKind: "trial",
      skipTrial: false,
    };
  }

  const deviceLimit = Math.floor(input.deviceLimit ?? 0);
  const storageLimitBytes = Math.floor(input.storageLimitBytes ?? 0);
  if (!Number.isFinite(deviceLimit) || deviceLimit < 1) {
    return { error: "Screen limit must be at least 1" };
  }
  if (!Number.isFinite(storageLimitBytes) || storageLimitBytes < MIN_STORAGE_LIMIT_BYTES) {
    return { error: "Storage limit is too low" };
  }

  return {
    mode: "custom",
    planTemplateId: null,
    planName: null,
    deviceLimit,
    storageLimitBytes,
    trialDays: null,
    trialEndsAt: null,
    planKind: "custom",
    skipTrial: true,
  };
}

export function provisioningSummary(provisioning: ResolvedClientProvisioning): string {
  if (provisioning.mode === "trial") {
    return `${provisioning.trialDays}-day trial on ${provisioning.planName ?? "Solo"}`;
  }
  if (provisioning.mode === "catalog" && provisioning.planName) {
    return `${provisioning.planName} (active account)`;
  }
  return "Custom limits (active account)";
}
