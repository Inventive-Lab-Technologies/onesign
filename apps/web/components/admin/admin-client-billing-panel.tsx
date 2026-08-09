"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type {
  AccountAddon,
  AccountBilling,
  AddonTemplate,
  BillingInvoice,
  BillingInvoiceLine,
} from "@signage/types";
import { useAdminStaff } from "@/components/admin/admin-staff-context";
import { Button } from "@/components/ui/button";
import { formatPlanMinorUnits, type PlanCurrency } from "@/lib/plan-currency";
import { cn } from "@/lib/utils";

type Summary = {
  billing: AccountBilling | null;
  addons: Array<AccountAddon & { addon: AddonTemplate | null }>;
  invoices: Array<BillingInvoice & { lines: BillingInvoiceLine[] }>;
  catalogAddons: AddonTemplate[];
  error?: string;
};

export function AdminClientBillingPanel({ userId }: { userId: string }) {
  const router = useRouter();
  const { canWrite } = useAdminStaff();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/clients/${userId}/billing`, {
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => null)) as Summary | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not load billing");
      setSummary(payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load billing");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runAction(body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/clients/${userId}/billing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Action failed");
      toast.success(successMessage);
      await refresh();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
        Loading billing…
      </div>
    );
  }

  if (!summary) return null;

  const currency = (summary.billing?.currency ?? "USD") as PlanCurrency;
  const verified = Boolean(summary.billing?.payment_verified_at);

  return (
    <div className="space-y-4 rounded-xl border border-border/90 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Manual billing</h2>
          <p className="text-sm text-muted-foreground">
            Invoices, payment verification, and active addons for this client.
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
            verified
              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
              : "bg-muted text-muted-foreground ring-border",
          )}
        >
          {verified ? "Payment verified" : "Not verified"}
        </span>
      </div>

      {summary.billing?.custom_monthly_amount_cents != null ? (
        <p className="text-sm text-muted-foreground">
          Custom monthly price:{" "}
          <span className="font-medium text-foreground">
            {formatPlanMinorUnits(summary.billing.custom_monthly_amount_cents, currency)}
          </span>
        </p>
      ) : null}

      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void runAction(
                { action: verified ? "unverify_payment" : "verify_payment" },
                verified ? "Payment unmarked" : "Payment verified",
              )
            }
          >
            {verified ? "Clear verification" : "Mark payment verified"}
          </Button>
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Active addons
        </h3>
        {summary.addons.length === 0 ? (
          <p className="text-sm text-muted-foreground">None</p>
        ) : (
          <ul className="space-y-2">
            {summary.addons.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm"
              >
                <span>
                  {row.addon?.name ?? "Addon"}
                  {row.quantity > 1 ? ` × ${row.quantity}` : ""} ·{" "}
                  {formatPlanMinorUnits(
                    row.unit_amount_cents * row.quantity,
                    row.currency as PlanCurrency,
                  )}
                  /mo
                </span>
                {canWrite ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void runAction(
                        { action: "cancel_addon", accountAddonId: row.id },
                        "Addon canceled",
                      )
                    }
                  >
                    Cancel
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Invoices
        </h3>
        {summary.invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">None</p>
        ) : (
          <ul className="space-y-2">
            {summary.invoices.map((invoice) => (
              <li
                key={invoice.id}
                className="rounded-lg border border-border/70 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{invoice.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {invoice.status} ·{" "}
                      {formatPlanMinorUnits(invoice.total_cents, invoice.currency as PlanCurrency)}
                    </p>
                  </div>
                  {canWrite &&
                  (invoice.status === "open" || invoice.status === "payment_submitted") ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void runAction(
                          { action: "mark_invoice_paid", invoiceId: invoice.id },
                          "Invoice marked paid",
                        )
                      }
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Mark paid"}
                    </Button>
                  ) : null}
                </div>
                {invoice.payment_reference ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ref: {invoice.payment_method} · {invoice.payment_reference}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
