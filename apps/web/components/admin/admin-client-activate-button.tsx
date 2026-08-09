"use client";

import type { AdminUserDirectoryEntry, PlanTemplate } from "@signage/types";
import { Play, X } from "lucide-react";
import { useState } from "react";
import { useAdminStaff } from "@/components/admin/admin-staff-context";
import { AdminClientPlanForm } from "@/components/admin/admin-client-plan-form";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

export type AdminClientPlanDialogClient = Pick<
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

export function AdminClientPlanDialog({
  client,
  plans,
  open,
  onOpenChange,
  title,
  description = "Choose a plan and apply screen and storage limits for this account.",
  submitLabel = "Apply plan",
}: {
  client: AdminClientPlanDialogClient;
  plans: PlanTemplate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel?: string;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-labelledby="client-plan-dialog-title"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border/80 bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border/70 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 id="client-plan-dialog-title" className="text-base font-semibold text-foreground">
                {title}
              </h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close plan dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-5">
          <AdminClientPlanForm
            client={client}
            plans={plans}
            active={open}
            submitLabel={submitLabel}
            showCancel
            onCancel={() => onOpenChange(false)}
            onSuccess={() => onOpenChange(false)}
          />
        </div>
      </div>
    </div>
  );
}

export function AdminClientActivateButton({
  client,
  plans,
}: {
  client: AdminClientPlanDialogClient;
  plans: PlanTemplate[];
}) {
  const { canWrite } = useAdminStaff();
  const [open, setOpen] = useState(false);

  if (!canWrite) {
    return null;
  }

  const displayName = client.client_name?.trim() || client.email;
  const label = "Activate or change plan";

  return (
    <>
      <Tooltip label={label}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={label}
          className="h-8 w-8 shrink-0 border-emerald-300 bg-emerald-50 p-0 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
          onClick={() => setOpen(true)}
        >
          <Play className="h-4 w-4 fill-current" aria-hidden />
        </Button>
      </Tooltip>

      <AdminClientPlanDialog
        client={client}
        plans={plans}
        open={open}
        onOpenChange={setOpen}
        title={`Activate ${displayName}`}
      />
    </>
  );
}
