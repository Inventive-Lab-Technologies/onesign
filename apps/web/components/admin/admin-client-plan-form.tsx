"use client";

import type { AddonTemplate, AdminUserDirectoryEntry, PlanTemplate } from "@signage/types";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CLIENT_PLAN_CUSTOM_VALUE,
  CLIENT_PLAN_TRIAL_VALUE,
  findSoloPlan,
  type ClientProvisioningMode,
} from "@/lib/admin/client-provisioning";
import { guessClientPlanSelection } from "@/lib/admin/client-plan-label";
import { getAddonUnitAmount, getPlanBaseAmount, majorAmountFromMinor, parseMajorAmountToMinor } from "@/lib/billing/amounts";
import {
  PLAN_CURRENCIES,
  formatPlanMinorUnits,
  type PlanCurrency,
} from "@/lib/plan-currency";
import {
  DEFAULT_TRIAL_DAYS,
  formatStorageBytes,
  parseStorageInput,
  type StorageUnit,
} from "@/lib/plan-quota";
import { cn } from "@/lib/utils";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";

function planLimitsLabel(deviceLimit: number, storageLimitBytes: number): string {
  return `${deviceLimit} screen${deviceLimit === 1 ? "" : "s"} · ${formatStorageBytes(storageLimitBytes)} storage`;
}

export type AdminClientPlanFormClient = Pick<
  AdminUserDirectoryEntry,
  | "id"
  | "email"
  | "client_name"
  | "device_limit"
  | "storage_limit_bytes"
  | "trial_ends_at"
  | "trial_expired"
  | "plan_kind"
>;

type AdminClientPlanFormProps = {
  client: AdminClientPlanFormClient;
  plans: PlanTemplate[];
  /** When false, form remounts initial selection from the client (e.g. dialog closed). */
  active?: boolean;
  submitLabel?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
};

export function AdminClientPlanForm({
  client,
  plans,
  active = true,
  submitLabel = "Apply plan",
  onSuccess,
  onCancel,
  showCancel = false,
}: AdminClientPlanFormProps) {
  const router = useRouter();
  const defaultPlanId = plans[0]?.id ?? CLIENT_PLAN_CUSTOM_VALUE;

  const [planSelection, setPlanSelection] = useState(defaultPlanId);
  const [trialDays, setTrialDays] = useState(String(DEFAULT_TRIAL_DAYS));
  const [deviceLimit, setDeviceLimit] = useState(String(client.device_limit));
  const [storageValue, setStorageValue] = useState("500");
  const [storageUnit, setStorageUnit] = useState<StorageUnit>("MB");
  const [loading, setLoading] = useState(false);

  const [currency, setCurrency] = useState<PlanCurrency>("BDT");
  const [amountInput, setAmountInput] = useState("");
  const [createInvoice, setCreateInvoice] = useState(true);
  const [billingNotes, setBillingNotes] = useState("");
  const [catalogAddons, setCatalogAddons] = useState<AddonTemplate[]>([]);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(false);

  const provisioningMode: ClientProvisioningMode = useMemo(() => {
    if (planSelection === CLIENT_PLAN_TRIAL_VALUE) return "trial";
    if (planSelection === CLIENT_PLAN_CUSTOM_VALUE) return "custom";
    return "catalog";
  }, [planSelection]);

  const selectedCatalogPlan = useMemo(
    () => (provisioningMode === "catalog" ? plans.find((plan) => plan.id === planSelection) : null),
    [plans, planSelection, provisioningMode],
  );

  const soloPlan = useMemo(() => findSoloPlan(plans), [plans]);
  const showBilling = provisioningMode !== "trial";

  useEffect(() => {
    if (!active) return;
    const initialSelection = guessClientPlanSelection(
      client,
      plans,
      CLIENT_PLAN_TRIAL_VALUE,
      CLIENT_PLAN_CUSTOM_VALUE,
    );
    setPlanSelection(initialSelection);
    setTrialDays(String(DEFAULT_TRIAL_DAYS));
    setDeviceLimit(String(client.device_limit));
    const storageMb = client.storage_limit_bytes / (1024 * 1024);
    if (storageMb >= 1024 && storageMb % 1024 === 0) {
      setStorageUnit("GB");
      setStorageValue(String(storageMb / 1024));
    } else {
      setStorageUnit("MB");
      setStorageValue(String(Math.round(storageMb)));
    }
    setCreateInvoice(true);
    setBillingNotes("");
    setSelectedAddonIds([]);
  }, [active, client, plans]);

  useEffect(() => {
    if (!active) return;
    if (provisioningMode === "catalog" && selectedCatalogPlan) {
      setDeviceLimit(String(selectedCatalogPlan.device_limit));
      const storageMb = selectedCatalogPlan.storage_limit_bytes / (1024 * 1024);
      if (storageMb >= 1024 && storageMb % 1024 === 0) {
        setStorageUnit("GB");
        setStorageValue(String(storageMb / 1024));
      } else {
        setStorageUnit("MB");
        setStorageValue(String(Math.round(storageMb)));
      }
      const catalogAmount = getPlanBaseAmount(selectedCatalogPlan, currency);
      setAmountInput(catalogAmount != null ? majorAmountFromMinor(catalogAmount) : "");
      return;
    }

    if (provisioningMode === "trial" && soloPlan) {
      setDeviceLimit(String(soloPlan.device_limit));
      setStorageValue(String(Math.round(soloPlan.storage_limit_bytes / (1024 * 1024))));
      setStorageUnit("MB");
      setAmountInput("");
      setCreateInvoice(false);
    }

    if (provisioningMode === "custom") {
      setCreateInvoice(true);
    }
  }, [active, provisioningMode, selectedCatalogPlan, soloPlan, currency]);

  useEffect(() => {
    if (!active || !showBilling) return;
    let cancelled = false;
    setAddonsLoading(true);
    void fetch("/api/admin/addons", { credentials: "same-origin" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          addons?: AddonTemplate[];
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(payload?.error ?? "Could not load addons");
        }
        if (!cancelled) {
          setCatalogAddons((payload?.addons ?? []).filter((addon) => addon.is_active));
        }
      })
      .catch(() => {
        if (!cancelled) setCatalogAddons([]);
      })
      .finally(() => {
        if (!cancelled) setAddonsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, showBilling]);

  const limitsPreview = useMemo(() => {
    if (provisioningMode === "catalog" && selectedCatalogPlan) {
      return planLimitsLabel(selectedCatalogPlan.device_limit, selectedCatalogPlan.storage_limit_bytes);
    }
    if (provisioningMode === "trial" && soloPlan) {
      return `${trialDays}-day trial · ${planLimitsLabel(soloPlan.device_limit, soloPlan.storage_limit_bytes)}`;
    }
    if (provisioningMode === "custom") {
      const storageLimitBytes = parseStorageInput(storageValue, storageUnit);
      if (storageLimitBytes) {
        const parsedLimit = Number.parseInt(deviceLimit, 10);
        if (Number.isFinite(parsedLimit) && parsedLimit >= 1) {
          return planLimitsLabel(parsedLimit, storageLimitBytes);
        }
      }
    }
    return null;
  }, [provisioningMode, selectedCatalogPlan, soloPlan, trialDays, deviceLimit, storageValue, storageUnit]);

  const addonTotalMinor = useMemo(() => {
    return selectedAddonIds.reduce((sum, id) => {
      const addon = catalogAddons.find((row) => row.id === id);
      if (!addon) return sum;
      return sum + getAddonUnitAmount(addon, currency);
    }, 0);
  }, [selectedAddonIds, catalogAddons, currency]);

  const displayName = client.client_name?.trim() || client.email;

  function toggleAddon(addonId: string) {
    setSelectedAddonIds((current) =>
      current.includes(addonId) ? current.filter((id) => id !== addonId) : [...current, addonId],
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const provisioningBase =
        provisioningMode === "catalog"
          ? { mode: "catalog" as const, planTemplateId: planSelection }
          : provisioningMode === "trial"
            ? {
                mode: "trial" as const,
                trialDays: Number.parseInt(trialDays, 10),
              }
            : {
                mode: "custom" as const,
                deviceLimit: Number.parseInt(deviceLimit, 10),
                storageLimitBytes: parseStorageInput(storageValue, storageUnit) ?? undefined,
              };

      let billing: {
        createInvoice: boolean;
        currency: PlanCurrency;
        monthlyAmountCents: number | null;
        addons: Array<{ addonTemplateId: string; quantity: number }>;
        notes: string | null;
      } | null = null;

      if (showBilling) {
        const monthlyAmountCents = amountInput.trim()
          ? parseMajorAmountToMinor(amountInput)
          : null;
        if (createInvoice && (monthlyAmountCents == null || monthlyAmountCents < 0)) {
          throw new Error("Enter a monthly amount for the invoice");
        }
        billing = {
          createInvoice,
          currency,
          monthlyAmountCents,
          addons: selectedAddonIds.map((addonTemplateId) => ({
            addonTemplateId,
            quantity: 1,
          })),
          notes: billingNotes.trim() || null,
        };
      }

      const response = await fetch("/api/admin/provision-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          userId: client.id,
          provisioning: {
            ...provisioningBase,
            ...(billing ? { billing } : {}),
          },
        }),
      });

      const result = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(result?.error ?? "Could not update plan");
      }

      toast.success(result?.message ?? `Plan updated for ${displayName}`);
      onSuccess?.();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update plan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`client-plan-${client.id}`}>Plan</Label>
        <select
          id={`client-plan-${client.id}`}
          className={SELECT_CLASS}
          value={planSelection}
          onChange={(event) => setPlanSelection(event.target.value)}
        >
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
          <option value={CLIENT_PLAN_TRIAL_VALUE}>Trial</option>
          <option value={CLIENT_PLAN_CUSTOM_VALUE}>Custom limits</option>
        </select>
        {limitsPreview ? <p className="text-xs text-muted-foreground">{limitsPreview}</p> : null}
      </div>

      {provisioningMode === "trial" ? (
        <div className="space-y-2">
          <Label htmlFor={`client-trial-days-${client.id}`}>Trial length (days)</Label>
          <Input
            id={`client-trial-days-${client.id}`}
            type="number"
            min={1}
            max={365}
            value={trialDays}
            onChange={(event) => setTrialDays(event.target.value)}
            required
          />
        </div>
      ) : null}

      {provisioningMode === "custom" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`client-device-limit-${client.id}`}>Screen limit</Label>
            <Input
              id={`client-device-limit-${client.id}`}
              type="number"
              min={1}
              value={deviceLimit}
              onChange={(event) => setDeviceLimit(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`client-storage-${client.id}`}>Storage</Label>
            <div className="flex gap-2">
              <Input
                id={`client-storage-${client.id}`}
                type="number"
                min={1}
                step="any"
                value={storageValue}
                onChange={(event) => setStorageValue(event.target.value)}
                className="flex-1"
              />
              <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-input">
                {(["MB", "GB"] as StorageUnit[]).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => setStorageUnit(unit)}
                    className={cn(
                      "px-2.5 text-xs font-medium transition-colors",
                      storageUnit === unit
                        ? "bg-brand-faint15 text-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {unit}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showBilling ? (
        <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Billing</p>
              <p className="text-xs text-muted-foreground">
                Set the monthly amount and optional addons. An invoice is created on activate.
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="rounded border-input"
                checked={createInvoice}
                onChange={(event) => setCreateInvoice(event.target.checked)}
              />
              Create invoice
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`client-currency-${client.id}`}>Currency</Label>
              <select
                id={`client-currency-${client.id}`}
                className={SELECT_CLASS}
                value={currency}
                onChange={(event) => setCurrency(event.target.value as PlanCurrency)}
              >
                {PLAN_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`client-amount-${client.id}`}>Monthly price</Label>
              <Input
                id={`client-amount-${client.id}`}
                inputMode="decimal"
                placeholder="0"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                required={createInvoice}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Addons</Label>
            {addonsLoading ? (
              <p className="text-xs text-muted-foreground">Loading addons…</p>
            ) : catalogAddons.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No addons yet. Create Extra screen / Extra space under Admin → Addons.
              </p>
            ) : (
              <ul className="space-y-2">
                {catalogAddons.map((addon) => {
                  const checked = selectedAddonIds.includes(addon.id);
                  const unit = getAddonUnitAmount(addon, currency);
                  return (
                    <li key={addon.id}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5 rounded border-input"
                          checked={checked}
                          onChange={() => toggleAddon(addon.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-foreground">{addon.name}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {addon.description ||
                              (addon.kind === "extra_screen"
                                ? `+${addon.device_delta} screen`
                                : `+${formatStorageBytes(addon.storage_delta_bytes)}`)}
                            {" · "}
                            {formatPlanMinorUnits(unit, currency)}/mo
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {addonTotalMinor > 0 ? (
              <p className="text-xs text-muted-foreground">
                Addons: {formatPlanMinorUnits(addonTotalMinor, currency)}/mo
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`client-billing-notes-${client.id}`}>Invoice notes (optional)</Label>
            <Input
              id={`client-billing-notes-${client.id}`}
              value={billingNotes}
              onChange={(event) => setBillingNotes(event.target.value)}
              placeholder="e.g. Special customer pricing"
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        {showCancel && onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={loading} className="min-w-[9rem] gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {loading ? "Applying…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
