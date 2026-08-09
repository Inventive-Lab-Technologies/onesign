"use client";

import type { AddonKind, AddonTemplate } from "@signage/types";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAdminStaff } from "@/components/admin/admin-staff-context";
import { ConfirmModal } from "@/components/shell/confirm-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { majorAmountFromMinor, parseMajorAmountToMinor } from "@/lib/billing/amounts";
import {
  PLAN_CURRENCIES,
  formatPlanMinorUnits,
  type PlanCurrency,
} from "@/lib/plan-currency";
import { formatStorageBytes, parseStorageInput, type StorageUnit } from "@/lib/plan-quota";
import { cn } from "@/lib/utils";

type AddonFormState = {
  id: string | null;
  name: string;
  description: string;
  kind: AddonKind;
  deviceDelta: string;
  storageValue: string;
  storageUnit: StorageUnit;
  prices: Record<PlanCurrency, string>;
  isActive: boolean;
  sortOrder: string;
};

function emptyForm(): AddonFormState {
  return {
    id: null,
    name: "",
    description: "",
    kind: "extra_screen",
    deviceDelta: "1",
    storageValue: "1",
    storageUnit: "GB",
    prices: { USD: "", GBP: "", EUR: "", BDT: "" },
    isActive: true,
    sortOrder: "10",
  };
}

function formFromAddon(addon: AddonTemplate): AddonFormState {
  const storageBytes = addon.storage_delta_bytes;
  const storageGb = storageBytes / (1024 ** 3);
  const useGb = storageGb >= 1 && Number.isInteger(storageGb);
  return {
    id: addon.id,
    name: addon.name,
    description: addon.description,
    kind: addon.kind,
    deviceDelta: String(addon.device_delta),
    storageValue: useGb ? String(storageGb) : String(Math.round(storageBytes / (1024 ** 2))),
    storageUnit: useGb ? "GB" : "MB",
    prices: {
      USD: majorAmountFromMinor(addon.monthly_price_cents),
      GBP: majorAmountFromMinor(addon.monthly_price_gbp_cents),
      EUR: majorAmountFromMinor(addon.monthly_price_eur_cents),
      BDT: majorAmountFromMinor(addon.monthly_price_bdt_paisa),
    },
    isActive: addon.is_active,
    sortOrder: String(addon.sort_order),
  };
}

export function AdminAddonsManager({ addons: initialAddons }: { addons: AddonTemplate[] }) {
  const router = useRouter();
  const { canWrite } = useAdminStaff();
  const [addons, setAddons] = useState(initialAddons);
  const [form, setForm] = useState<AddonFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AddonTemplate | null>(null);

  const sorted = useMemo(
    () => [...addons].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [addons],
  );

  async function saveForm() {
    if (!form) return;
    setSaving(true);
    try {
      const deviceDelta =
        form.kind === "extra_screen" ? Number.parseInt(form.deviceDelta, 10) : 0;
      const storageDeltaBytes =
        form.kind === "extra_storage"
          ? parseStorageInput(form.storageValue, form.storageUnit)
          : 0;

      if (form.kind === "extra_screen" && (!Number.isFinite(deviceDelta) || deviceDelta < 1)) {
        throw new Error("Screen delta must be at least 1");
      }
      if (form.kind === "extra_storage" && !storageDeltaBytes) {
        throw new Error("Enter a storage amount");
      }

      const prices = Object.fromEntries(
        PLAN_CURRENCIES.map((currency) => {
          const minor = parseMajorAmountToMinor(form.prices[currency] || "0");
          if (minor == null) throw new Error(`Invalid ${currency} price`);
          return [currency, minor];
        }),
      ) as Record<PlanCurrency, number>;

      const response = await fetch("/api/admin/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          id: form.id,
          name: form.name,
          description: form.description,
          kind: form.kind,
          deviceDelta,
          storageDeltaBytes,
          monthlyPriceCents: prices.USD,
          monthlyPriceGbpCents: prices.GBP,
          monthlyPriceEurCents: prices.EUR,
          monthlyPriceBdtPaisa: prices.BDT,
          isActive: form.isActive,
          sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        addon?: AddonTemplate;
        error?: string;
      } | null;
      if (!response.ok || !payload?.addon) {
        throw new Error(payload?.error ?? "Could not save addon");
      }

      setAddons((current) => {
        const without = current.filter((row) => row.id !== payload.addon!.id);
        return [...without, payload.addon!];
      });
      setForm(null);
      toast.success(form.id ? "Addon updated" : "Addon created");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save addon");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAddon() {
    if (!pendingDelete) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/addons/${pendingDelete.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not delete addon");
      setAddons((current) =>
        current.map((row) =>
          row.id === pendingDelete.id ? { ...row, is_active: false } : row,
        ),
      );
      setPendingDelete(null);
      toast.success("Addon removed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete addon");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Addon catalog</h2>
          <p className="text-sm text-muted-foreground">
            Extra screen and Extra space packs billed with manual activations and customer add-ons.
          </p>
        </div>
        {canWrite ? (
          <Button type="button" size="sm" className="gap-1.5" onClick={() => setForm(emptyForm())}>
            <Plus className="h-4 w-4" aria-hidden />
            New addon
          </Button>
        ) : null}
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {sorted.map((addon) => (
          <li key={addon.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">{addon.name}</p>
                {!addon.is_active ? (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    Inactive
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {addon.kind === "extra_screen"
                  ? `+${addon.device_delta} screen`
                  : `+${formatStorageBytes(addon.storage_delta_bytes)}`}
                {" · "}
                {formatPlanMinorUnits(addon.monthly_price_bdt_paisa, "BDT")}/mo ·{" "}
                {formatPlanMinorUnits(addon.monthly_price_cents, "USD")}/mo
              </p>
            </div>
            {canWrite ? (
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setForm(formFromAddon(addon))}
                  aria-label={`Edit ${addon.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0 text-destructive"
                  onClick={() => setPendingDelete(addon)}
                  aria-label={`Delete ${addon.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            ) : null}
          </li>
        ))}
        {sorted.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">No addons yet.</li>
        ) : null}
      </ul>

      {form ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {form.id ? "Edit addon" : "New addon"}
                </h3>
                <p className="text-sm text-muted-foreground">Prices are monthly recurring amounts.</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                onClick={() => setForm(null)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="addon-name">Name</Label>
                <Input
                  id="addon-name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addon-description">Description</Label>
                <Input
                  id="addon-description"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="addon-kind">Kind</Label>
                <select
                  id="addon-kind"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.kind}
                  onChange={(event) =>
                    setForm({ ...form, kind: event.target.value as AddonKind })
                  }
                >
                  <option value="extra_screen">Extra screen</option>
                  <option value="extra_storage">Extra space</option>
                </select>
              </div>

              {form.kind === "extra_screen" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="addon-device-delta">Screens added</Label>
                  <Input
                    id="addon-device-delta"
                    type="number"
                    min={1}
                    value={form.deviceDelta}
                    onChange={(event) => setForm({ ...form, deviceDelta: event.target.value })}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="addon-storage">Storage added</Label>
                  <div className="flex gap-2">
                    <Input
                      id="addon-storage"
                      type="number"
                      min={1}
                      step="any"
                      value={form.storageValue}
                      onChange={(event) => setForm({ ...form, storageValue: event.target.value })}
                      className="flex-1"
                    />
                    <div className="inline-flex overflow-hidden rounded-md border border-input">
                      {(["MB", "GB"] as StorageUnit[]).map((unit) => (
                        <button
                          key={unit}
                          type="button"
                          onClick={() => setForm({ ...form, storageUnit: unit })}
                          className={cn(
                            "px-2.5 text-xs font-medium",
                            form.storageUnit === unit
                              ? "bg-brand-faint15 text-foreground"
                              : "bg-background text-muted-foreground",
                          )}
                        >
                          {unit}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {PLAN_CURRENCIES.map((currency) => (
                  <div key={currency} className="space-y-1.5">
                    <Label htmlFor={`addon-price-${currency}`}>{currency} / month</Label>
                    <Input
                      id={`addon-price-${currency}`}
                      inputMode="decimal"
                      value={form.prices[currency]}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          prices: { ...form.prices, [currency]: event.target.value },
                        })
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="addon-sort">Sort order</Label>
                  <Input
                    id="addon-sort"
                    type="number"
                    value={form.sortOrder}
                    onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
                  />
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    className="rounded border-input"
                    checked={form.isActive}
                    onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                  />
                  Active
                </label>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setForm(null)} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void saveForm()} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Save addon
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Remove addon?"
        message={
          pendingDelete
            ? `“${pendingDelete.name}” will be deleted, or deactivated if still in use.`
            : undefined
        }
        confirmLabel={saving ? "Removing…" : "Remove"}
        variant="danger"
        onClose={() => !saving && setPendingDelete(null)}
        onConfirm={() => void deleteAddon()}
      />
    </div>
  );
}
