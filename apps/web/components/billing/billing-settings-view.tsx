"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, HardDrive, Minus, Monitor } from "lucide-react";
import { toast } from "sonner";
import { ManualBillingPanel } from "@/components/billing/manual-billing-panel";
import { usePlanQuota } from "@/components/console/plan-quota-context";
import { type PlanViewModel } from "@/components/plans/plan-data";
import { PlanPricingSection } from "@/components/plans/plan-pricing-section";
import { type PlanPricingCardAction } from "@/components/plans/plan-pricing-card";
import { Button } from "@/components/ui/button";
import { planCurrencyFooter, type PlanCurrency } from "@/lib/plan-currency";
import {
  billingContactMailto,
  billingUpgradeMailto,
  currentPlanLabel,
  getPlanAction,
  isStripeCheckoutEnabled,
  matchCatalogPlan,
  type PlanAction,
} from "@/lib/plan/billing";
import {
  describePlanEntitlements,
  emptyPlanEntitlements,
  type PlanEntitlements,
} from "@/lib/plan/plan-entitlements";
import {
  deviceUsageRatio,
  deviceUsageTone,
  formatStorageUsage,
  storageUsageRatio,
  storageUsageTone,
} from "@/lib/plan-quota";
import { formatTrialEndDate, formatTrialRemaining, isOnTrial } from "@/lib/trial";
import { cn } from "@/lib/utils";

const meterToneClasses: Record<"ok" | "warn" | "full", { fill: string; text: string }> = {
  ok: { fill: "bg-brand", text: "text-foreground" },
  warn: { fill: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  full: { fill: "bg-red-500", text: "text-red-700 dark:text-red-400" },
};

const handledStripeCheckoutReturns = new Set<string>();

export function BillingSettingsView({
  plans,
  currency = "USD",
}: {
  plans: PlanViewModel[];
  currency?: PlanCurrency;
}) {
  const quota = usePlanQuota();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [portalLoading, setPortalLoading] = useState(false);
  const stripeEnabled = isStripeCheckoutEnabled();

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout !== "success" && checkout !== "cancel") return;

    const sessionId = searchParams.get("session_id");
    const handleKey = `${checkout}:${sessionId ?? "default"}`;
    if (handledStripeCheckoutReturns.has(handleKey)) return;
    handledStripeCheckoutReturns.add(handleKey);

    void (async () => {
      try {
        if (checkout === "cancel") {
          toast.message("Checkout canceled.");
          return;
        }

        const response = await fetch("/api/stripe/sync-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(sessionId ? { checkoutSessionId: sessionId } : {}),
          }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          subscriptionId?: string | null;
          status?: string;
        };

        const toastKey = sessionId ? `onesign:checkout-toast:${sessionId}` : null;
        const showOnce = (kind: "success" | "message" | "error", message: string) => {
          if (toastKey && sessionStorage.getItem(toastKey)) return;
          if (toastKey) sessionStorage.setItem(toastKey, "1");
          if (kind === "success") toast.success(message);
          else if (kind === "message") toast.message(message);
          else toast.error(message);
        };

        if (!response.ok) {
          showOnce(
            "error",
            payload.error || "Payment received, but plan sync failed. Try again or contact support.",
          );
        } else if (payload.ok && payload.subscriptionId && payload.status !== "none") {
          showOnce("success", "Subscription active. Your plan limits have been updated.");
        } else {
          showOnce(
            "message",
            "Payment received. Your plan limits may take a moment to refresh — pull to refresh if needed.",
          );
        }
      } catch {
        toast.error("Payment received, but plan sync failed. Refresh the page or contact support.");
      } finally {
        router.replace("/account?tab=billing", { scroll: false });
        if (checkout === "success") {
          router.refresh();
        }
      }
    })();
  }, [searchParams, router]);

  if (!quota) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
        Loading billing details…
      </div>
    );
  }

  const catalog = plans.length > 0 ? plans : [];
  const currentPlan = matchCatalogPlan(catalog, quota);
  const planInfo = currentPlanLabel(catalog, quota);
  const onTrial = quota.isOnTrial ?? isOnTrial(quota);
  const trialRemaining = formatTrialRemaining(quota.trialEndsAt);
  const trialEnd = formatTrialEndDate(quota.trialEndsAt);
  const showManageBilling = stripeEnabled && !onTrial;

  async function openBillingPortal() {
    setPortalLoading(true);
    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Could not open billing portal");
      }
      window.location.href = payload.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open billing portal");
      setPortalLoading(false);
    }
  }

  return (
    <div className="space-y-10">
      <CurrentPlanSummary
        planName={planInfo.name}
        planDescription={planInfo.description}
        status={planInfo.status}
        onTrial={onTrial}
        trialRemaining={trialRemaining}
        trialEnd={trialEnd}
        deviceCount={quota.deviceCount}
        deviceLimit={quota.deviceLimit}
        storageUsedBytes={quota.storageUsedBytes}
        storageLimitBytes={quota.storageLimitBytes}
        entitlements={currentPlan?.entitlements ?? emptyPlanEntitlements()}
        manageBilling={
          showManageBilling ? (
            <Button type="button" variant="outline" disabled={portalLoading} onClick={() => void openBillingPortal()}>
              Manage billing
            </Button>
          ) : null
        }
      />

      <ManualBillingPanel />

      {catalog.length > 0 ? (
        <PlanPricingSection
          sectionClassName="plan-pricing"
          plans={catalog}
          heading={
            <div className="mx-auto max-w-2xl text-center">
              <h3 className="text-base font-semibold text-foreground">Change plan</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Start with a 14-day Solo trial, then pick the plan that matches your screen count. No setup
                fees, cancel anytime.
              </p>
              {stripeEnabled && currency !== "USD" ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Checkout is processed in USD. Displayed {currency} prices are approximate.
                </p>
              ) : null}
            </div>
          }
          isCurrentPlan={(plan) => !onTrial && currentPlan?.id === plan.id}
          getAction={(plan, _index, billingPeriod) =>
            toPricingAction(getPlanAction(currentPlan, plan, quota, billingPeriod))
          }
          enterpriseHref={billingUpgradeMailto("Custom", "monthly")}
        />
      ) : null}

      <footer className="border-t border-border pt-6 text-center text-xs leading-relaxed text-muted-foreground">
        <p>{planCurrencyFooter(currency)}</p>
        <p className="mt-1.5">
          Questions?{" "}
          <a
            href={billingContactMailto()}
            className="font-medium text-brand-strong underline underline-offset-2"
          >
            Contact billing
          </a>
        </p>
      </footer>
    </div>
  );
}

function toPricingAction(action: PlanAction): PlanPricingCardAction {
  const canCheckout =
    (action.kind === "checkout" ||
      action.kind === "upgrade" ||
      action.kind === "downgrade") &&
    Boolean(action.planId);

  if (canCheckout && action.planId) {
    return {
      label: action.label,
      checkout: {
        planId: action.planId,
        billingPeriod: action.billingPeriod ?? "monthly",
      },
    };
  }

  return {
    label: action.label,
    href: action.href,
    disabled: action.disabled,
  };
}

function CurrentPlanSummary({
  planName,
  planDescription,
  status,
  onTrial,
  trialRemaining,
  trialEnd,
  deviceCount,
  deviceLimit,
  storageUsedBytes,
  storageLimitBytes,
  entitlements,
  manageBilling,
}: {
  planName: string;
  planDescription: string;
  status: string;
  onTrial: boolean;
  trialRemaining: string | null;
  trialEnd: string | null;
  deviceCount: number;
  deviceLimit: number;
  storageUsedBytes: number;
  storageLimitBytes: number;
  entitlements: PlanEntitlements;
  manageBilling?: React.ReactNode;
}) {
  const screenRatio = deviceUsageRatio(deviceCount, deviceLimit);
  const screenTone = deviceUsageTone(screenRatio);
  const storageRatio = storageUsageRatio(storageUsedBytes, storageLimitBytes);
  const storageTone = storageUsageTone(storageRatio);
  const entitlementRows = describePlanEntitlements(entitlements);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">Current plan</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">{planName}</h2>
            <StatusBadge status={status} onTrial={onTrial} />
          </div>
          <p className="mt-1.5 max-w-lg text-sm text-muted-foreground">{planDescription}</p>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          {onTrial && trialRemaining ? (
            <div className="rounded-lg bg-amber-50 px-3.5 py-2 text-sm ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10">
              <p className="font-medium text-amber-800 dark:text-amber-300">{trialRemaining}</p>
              {trialEnd ? <p className="text-xs text-amber-700/80 dark:text-amber-400/70">Ends {trialEnd}</p> : null}
            </div>
          ) : null}
          {manageBilling}
        </div>
      </div>

      <dl className="grid grid-cols-1 divide-y divide-border border-t border-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <UsageStat
          icon={Monitor}
          label="Screens"
          valueLabel={`${deviceCount} of ${deviceLimit}`}
          ratio={screenRatio}
          tone={screenTone}
        />
        <UsageStat
          icon={HardDrive}
          label="Storage"
          valueLabel={formatStorageUsage(storageUsedBytes, storageLimitBytes)}
          ratio={storageRatio}
          tone={storageTone}
        />
      </dl>

      <div className="border-t border-border px-6 py-5 sm:px-8">
        <p className="text-sm font-medium text-foreground">Included with this plan</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {entitlementRows.map((row) => (
            <li key={row.id} className="flex items-start gap-2 text-sm">
              <span
                className={cn(
                  "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                  row.enabled
                    ? "bg-brand-soft text-brand-badge"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {row.enabled ? <Check className="h-3 w-3" aria-hidden /> : <Minus className="h-3 w-3" aria-hidden />}
              </span>
              <span>
                <span className="font-medium text-foreground">{row.label}</span>
                {row.detail ? (
                  <span className="block text-xs text-muted-foreground">{row.detail}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {screenTone === "full" ? (
        <p className="border-t border-red-600/15 bg-red-50 px-6 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400 sm:px-8">
          You&apos;ve reached your screen limit. Remove a device or upgrade to add more screens.
        </p>
      ) : null}
    </div>
  );
}

function UsageStat({
  icon: Icon,
  label,
  valueLabel,
  ratio,
  tone,
}: {
  icon: typeof Monitor;
  label: string;
  valueLabel: string;
  ratio: number;
  tone: "ok" | "warn" | "full";
}) {
  const styles = meterToneClasses[tone];
  const pct = Math.round(ratio * 100);

  return (
    <div className="px-6 py-5 sm:px-8">
      <dt className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
        {label}
      </dt>
      <dd className={cn("mt-1.5 text-xl font-semibold tabular-nums", styles.text)}>{valueLabel}</dd>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500 ease-out", styles.fill)}
          style={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label} usage`}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status, onTrial }: { status: string; onTrial: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
        onTrial
          ? "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400"
          : "bg-brand-soft text-brand-strong ring-brand/20",
      )}
    >
      {status}
    </span>
  );
}
