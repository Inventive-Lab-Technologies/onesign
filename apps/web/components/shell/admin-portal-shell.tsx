"use client";

import { useMemo } from "react";
import { useAppRouter } from "@/hooks/use-app-router";
import {
  CreditCard,
  LayoutDashboard,
  Monitor,
  PackagePlus,
  ScrollText,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { PlatformStaff } from "@signage/types";
import { AdminPortalSyncProvider } from "@/components/console/admin-portal-sync-provider";
import { AdminStaffProvider } from "@/components/admin/admin-staff-context";
import { AppLayout } from "@/components/shell/app-layout";
import { DashboardRoutePrefetch } from "@/components/shell/dashboard-route-prefetch";
import { NotificationsProvider } from "@/components/shell/notifications-context";
import { SettingsProvider } from "@/components/shell/settings-context";
import { clearConsoleCachePersist } from "@/stores/console-data-store";
import { clearStaffPortalChoice } from "@/lib/auth/staff-portal-choice";
import type { NavItem } from "@/components/shell/types";
import { getAdminPageTitle, getAdminPageIcon } from "@/lib/config/admin-layout";

const adminNavItems: NavItem[] = [
  { path: "/admin", label: "Clients", icon: Users, end: true },
  { path: "/admin/device-view", label: "Device View", icon: Monitor, end: true },
  { path: "/admin/plans", label: "Plans", icon: CreditCard, end: true },
  { path: "/admin/addons", label: "Addons", icon: PackagePlus, end: true },
  { path: "/admin/audit", label: "Audit log", icon: ScrollText, end: true },
  { path: "/admin/admins", label: "Admins", icon: Settings, end: true },
];

export function AdminPortalShell({
  children,
  staff,
}: {
  children: React.ReactNode;
  staff: PlatformStaff;
}) {
  const router = useAppRouter();
  const navItems = useMemo(() => {
    if (staff.role === "owner") return adminNavItems;
    return adminNavItems.filter((item) => item.path !== "/admin/admins");
  }, [staff.role]);
  const prefetchPaths = useMemo(
    () => navItems.map((item) => item.path),
    [navItems],
  );

  const displayName = staff.display_name?.trim() || staff.email.split("@")[0] || "Admin";
  const profileSubtext =
    staff.role === "viewer" ? `${staff.email} · Read-only` : staff.email;

  const brand = useMemo(
    () => ({
      name: "OneSign",
      subtitle: "Admin",
      icon: Shield,
      logoColor: "var(--theme)",
    }),
    [],
  );

  async function signOut() {
    try {
      const response = await fetch("/api/auth/signout", { method: "POST" });
      if (!response.ok) {
        toast.error("Sign out failed");
        return;
      }
      clearConsoleCachePersist();
      clearStaffPortalChoice();
      router.replace("/login");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign out failed";
      toast.error(message);
    }
  }

  return (
    <SettingsProvider>
      <NotificationsProvider>
        <AdminStaffProvider staff={staff}>
          <AdminPortalSyncProvider>
            <AppLayout
            brand={brand}
            navItems={navItems}
            getPageTitle={getAdminPageTitle}
            getPageIcon={getAdminPageIcon}
            userName={displayName}
            profileSubtext={profileSubtext}
            onSignOut={() => void signOut()}
            portalSwitch={{
              label: "Switch to my dashboard",
              href: "/dashboard",
              icon: LayoutDashboard,
              choice: "user",
            }}
            contentCardBg="#F4F7FB"
          >
            <DashboardRoutePrefetch paths={prefetchPaths} />
            {children}
          </AppLayout>
        </AdminPortalSyncProvider>
        </AdminStaffProvider>
      </NotificationsProvider>
    </SettingsProvider>
  );
}

