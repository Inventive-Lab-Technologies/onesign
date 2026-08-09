import {
  CreditCard,
  Layers,
  Monitor,
  PackagePlus,
  ScrollText,
  Settings,
  Tv,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export function getAdminPageTitle(pathname: string): string {
  if (pathname === "/admin") return "Clients";
  if (pathname === "/admin/device-view") return "Device View";
  if (pathname === "/admin/plans") return "Plans";
  if (pathname === "/admin/addons") return "Addons";
  if (pathname === "/admin/audit") return "Audit log";
  if (pathname === "/admin/admins") return "Admins";
  if (pathname === "/admin/staff") return "Admins";
  if (pathname.startsWith("/admin/clients/") && pathname.includes("/groups/")) return "Group";
  if (pathname.startsWith("/admin/clients/") && pathname.includes("/screens/")) return "Screen";
  if (pathname.startsWith("/admin/clients/") && pathname.includes("/content/calendar")) return "Schedule calendar";
  if (pathname.startsWith("/admin/clients/") && pathname.includes("/content/")) return "Content";
  if (pathname.startsWith("/admin/clients/") && pathname.includes("/websites/")) return "Website";
  if (pathname.startsWith("/admin/clients/") && pathname.includes("/playlists/")) return "Playlist";
  if (pathname.startsWith("/admin/clients/") && pathname.endsWith("/screens")) return "Screens";
  if (pathname.startsWith("/admin/clients/") && pathname.endsWith("/groups")) return "Groups";
  if (pathname.startsWith("/admin/clients/") && pathname.endsWith("/content")) return "Content";
  if (pathname.startsWith("/admin/clients/") && pathname.endsWith("/websites")) return "Websites";
  if (pathname.startsWith("/admin/clients/") && pathname.endsWith("/playlists")) return "Content";
  if (pathname.startsWith("/admin/clients/") && pathname.endsWith("/audit")) return "Audit log";
  if (pathname.startsWith("/admin/clients/") && pathname.endsWith("/users")) return "Users";
  if (pathname.startsWith("/admin/clients/") && pathname.endsWith("/plan")) return "Plan";
  if (pathname.startsWith("/admin/clients/")) return "Client";
  return "Admin";
}

export function getAdminPageIcon(pathname: string): LucideIcon | undefined {
  if (pathname === "/admin") return Users;
  if (pathname === "/admin/device-view") return Monitor;
  if (pathname === "/admin/plans") return CreditCard;
  if (pathname === "/admin/addons") return PackagePlus;
  if (pathname === "/admin/audit") return ScrollText;
  if (pathname === "/admin/admins" || pathname === "/admin/staff") return Settings;
  if (pathname.startsWith("/admin/clients/")) {
    if (pathname.includes("/screens")) return Monitor;
    if (pathname.includes("/groups")) return Tv;
    if (pathname.includes("/content") || pathname.includes("/playlists") || pathname.includes("/media")) {
      return Layers;
    }
    if (pathname.includes("/audit")) return ScrollText;
    if (pathname.includes("/users")) return Users;
    if (pathname.includes("/plan")) return CreditCard;
    return UserRound;
  }
  return undefined;
}
