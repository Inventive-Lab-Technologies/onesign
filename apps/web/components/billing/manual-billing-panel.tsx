"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackagePlus, Receipt } from "lucide-react";
import { toast } from "sonner";
import type {
  AccountAddon,
  AccountBilling,
  AddonTemplate,
  BillingInvoice,
  BillingInvoiceLine,
  BillingPaymentMethod,
} from "@signage/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYMENT_METHOD_LABELS } from "@/lib/billing/manual-billing";
import { formatPlanMinorUnits, type PlanCurrency } from "@/lib/plan-currency";
import { formatStorageBytes } from "@/lib/plan-quota";
import { cn } from "@/lib/utils";

type SummaryResponse = {
  accountId: string;
  billing: AccountBilling | null;
  addons: Array<AccountAddon & { addon: AddonTemplate | null }>;
  invoices: Array<BillingInvoice & { lines: BillingInvoiceLine[] }>;
  catalogAddons: AddonTemplate[];
  error?: string;
};

const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as BillingPaymentMethod[];

function statusLabel(status: BillingInvoice["status"]): string {
  switch (status) {
    case "open":
      return "Due";
    case "payment_submitted":
      return "Payment submitted";
    case "paid":
      return "Paid";
    case "void":
      return "Void";
    case "canceled":
      return "Canceled";
    default:
      return status;
  }
}

function statusTone(status: BillingInvoice["status"]): string {
  switch (status) {
    case "paid":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300";
    case "payment_submitted":
      return "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300";
    case "open":
      return "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300";
    default:
      return "bg-muted text-muted-foreground ring-border";
  }
}

export function ManualBillingPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [busyAddonId, setBusyAddonId] = useState<string | null>(null);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<BillingPaymentMethod>("bkash");
  const [paymentReference, setPaymentReference] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/billing/summary", { credentials: "same-origin" });
      const payload = (await response.json().catch(() => null)) as SummaryResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Could not load billing");
      }
      setSummary(payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load billing");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addAddon(addonTemplateId: string) {
    setBusyAddonId(addonTemplateId);
    try {
      const response = await fetch("/api/billing/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ addonTemplateId, quantity: 1 }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not add addon");
      toast.success(payload?.message ?? "Addon added");
      await refresh();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add addon");
    } finally {
      setBusyAddonId(null);
    }
  }

  async function cancelAddon(accountAddonId: string) {
    setBusyAddonId(accountAddonId);
    try {
      const response = await fetch(`/api/billing/addons/${accountAddonId}/cancel`, {
        method: "POST",
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not cancel addon");
      toast.success("Addon canceled");
      await refresh();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel addon");
    } finally {
      setBusyAddonId(null);
    }
  }

  async function submitPayment(invoiceId: string) {
    setPayingInvoiceId(invoiceId);
    try {
      const response = await fetch(`/api/billing/invoices/${invoiceId}/submit-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ paymentMethod, paymentReference }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not submit payment");
      toast.success(payload?.message ?? "Payment submitted");
      setPaymentReference("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit payment");
    } finally {
      setPayingInvoiceId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center text-sm text-muted-foreground">
        Loading invoices and addons…
      </div>
    );
  }

  if (!summary) return null;

  const currency = (summary.billing?.currency ?? "USD") as PlanCurrency;
  const verified = Boolean(summary.billing?.payment_verified_at);
  const openInvoices = summary.invoices.filter(
    (invoice) => invoice.status === "open" || invoice.status === "payment_submitted",
  );

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" aria-hidden />
              <h3 className="text-sm font-semibold text-foreground">Invoices & payments</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Manual package activations and addons appear here. Verify payment once; later addons
              invoice automatically.
            </p>
          </div>
          <span
            className={cn(
              "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
              verified
                ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "bg-muted text-muted-foreground ring-border",
            )}
          >
            {verified ? "Payment verified" : "Payment not verified yet"}
          </span>
        </div>

        {summary.billing?.custom_monthly_amount_cents != null ? (
          <p className="border-b border-border px-5 py-3 text-sm text-muted-foreground sm:px-6">
            Custom monthly price:{" "}
            <span className="font-medium text-foreground">
              {formatPlanMinorUnits(summary.billing.custom_monthly_amount_cents, currency)}
            </span>
          </p>
        ) : null}

        {summary.invoices.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground sm:px-6">
            No invoices yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {summary.invoices.map((invoice) => (
              <li key={invoice.id} className="px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{invoice.invoice_number}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(invoice.created_at).toLocaleDateString()} ·{" "}
                      {formatPlanMinorUnits(invoice.total_cents, invoice.currency as PlanCurrency)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
                      statusTone(invoice.status),
                    )}
                  >
                    {statusLabel(invoice.status)}
                  </span>
                </div>

                {invoice.lines.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {invoice.lines.map((line) => (
                      <li key={line.id} className="flex justify-between gap-3">
                        <span>{line.description}</span>
                        <span className="tabular-nums text-foreground">
                          {formatPlanMinorUnits(line.amount_cents, invoice.currency as PlanCurrency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {invoice.status === "open" ? (
                  <div className="mt-4 grid gap-3 rounded-lg border border-border/80 bg-muted/20 p-3 sm:grid-cols-[1fr_1fr_auto]">
                    <div className="space-y-1.5">
                      <Label htmlFor={`pay-method-${invoice.id}`}>Payment method</Label>
                      <select
                        id={`pay-method-${invoice.id}`}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={paymentMethod}
                        onChange={(event) =>
                          setPaymentMethod(event.target.value as BillingPaymentMethod)
                        }
                      >
                        {PAYMENT_METHODS.map((method) => (
                          <option key={method} value={method}>
                            {PAYMENT_METHOD_LABELS[method]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`pay-ref-${invoice.id}`}>Transaction / reference</Label>
                      <Input
                        id={`pay-ref-${invoice.id}`}
                        value={paymentReference}
                        onChange={(event) => setPaymentReference(event.target.value)}
                        placeholder="e.g. TrxID"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        disabled={payingInvoiceId === invoice.id}
                        onClick={() => void submitPayment(invoice.id)}
                        className="w-full gap-2 sm:w-auto"
                      >
                        {payingInvoiceId === invoice.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : null}
                        Submit payment
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {openInvoices.length > 0 ? (
          <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground sm:px-6">
            After your first payment is confirmed, new addons are added to invoices automatically.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <PackagePlus className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h3 className="text-sm font-semibold text-foreground">Addons</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Extra screens and storage. Cancel anytime; limits update immediately.
          </p>
        </div>

        {summary.addons.length > 0 ? (
          <ul className="divide-y divide-border border-b border-border">
            {summary.addons.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {row.addon?.name ?? "Addon"}
                    {row.quantity > 1 ? ` × ${row.quantity}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatPlanMinorUnits(row.unit_amount_cents * row.quantity, row.currency as PlanCurrency)}
                    /mo
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyAddonId === row.id}
                  onClick={() => void cancelAddon(row.id)}
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-b border-border px-5 py-4 text-sm text-muted-foreground sm:px-6">
            No active addons.
          </p>
        )}

        <ul className="divide-y divide-border">
          {summary.catalogAddons.map((addon) => (
            <li
              key={addon.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{addon.name}</p>
                <p className="text-xs text-muted-foreground">
                  {addon.description ||
                    (addon.kind === "extra_screen"
                      ? `+${addon.device_delta} screen`
                      : `+${formatStorageBytes(addon.storage_delta_bytes)}`)}
                  {" · "}
                  {formatPlanMinorUnits(
                    currency === "BDT"
                      ? addon.monthly_price_bdt_paisa
                      : currency === "GBP"
                        ? addon.monthly_price_gbp_cents
                        : currency === "EUR"
                          ? addon.monthly_price_eur_cents
                          : addon.monthly_price_cents,
                    currency,
                  )}
                  /mo
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={busyAddonId === addon.id}
                onClick={() => void addAddon(addon.id)}
              >
                {busyAddonId === addon.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  "Add"
                )}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
