/** Shared domain types for web + documentation parity with Supabase rows. */

// ---------------------------------------------------------------------------
// Workspaces & membership
// ---------------------------------------------------------------------------

/**
 * Per-workspace role. Mirrors the role dropdown in the Add User flow.
 * "No access" is represented by the absence of a workspace_members row.
 */
export type WorkspaceRole =
  | "owner"
  | "account_admin"
  | "admin"
  | "standard"
  | "content_manager"
  | "custom";

/** Granular permissions used when a member's role is `custom`. */
export type WorkspacePermission =
  | "view_screens"
  | "manage_screens"
  | "change_playlists"
  | "view_content"
  | "manage_content"
  | "view_websites"
  | "manage_websites"
  | "administrator"
  | "access_billing";

export interface Workspace {
  id: string;
  account_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
}

/** Legacy auto-created label → current product name. */
export function displayWorkspaceName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "Workspace";
  if (trimmed.toLowerCase() === "default workspace") return "Primary";
  return trimmed;
}

export interface AccountMember {
  id: string;
  account_id: string;
  user_id: string;
  is_owner: boolean;
  created_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  permissions: WorkspacePermission[];
  created_at: string;
}

/** A user listed under an account's "Users" tab, with their per-workspace roles. */
export interface AccountUser {
  user_id: string | null;
  email: string;
  display_name: string | null;
  is_owner: boolean;
  /** Pending invite that has not been accepted yet. */
  invitation_pending: boolean;
  /** Per-workspace role; workspaces the user has no access to are omitted. */
  workspace_roles: Array<{
    workspace_id: string;
    role: WorkspaceRole;
    permissions: WorkspacePermission[];
  }>;
}

export type DeviceStatus = "offline" | "online" | "pending_pairing";

/** Screen client: Android TV APK or browser player. */
export type DevicePlatform = "android" | "browser";

/** Dashboard setting; Android applies via Activity.requestedOrientation while playback runs. */
export type DeviceScreenOrientation =
  | "landscape"
  | "portrait"
  | "reverse_landscape"
  | "reverse_portrait";

export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface WeeklyDaySchedule {
  start: string;
  end: string;
}

export type WeeklySchedule = Record<WeekdayKey, WeeklyDaySchedule>;

export type MediaFileType = "image" | "video" | "unknown";

export interface Profile {
  id: string;
  client_name: string | null;
  created_at: string;
  is_disabled?: boolean;
  /** Max linked devices; default 1 for new accounts. */
  device_limit?: number;
  /** Max cloud storage bytes; default 2 GiB. */
  storage_limit_bytes?: number;
  /** Running total of media.size_bytes; maintained by DB trigger. */
  storage_used_bytes?: number;
  /** Null = no trial clock (legacy, paid, admin-invited). */
  trial_ends_at?: string | null;
  plan_kind?: "trial" | "standard" | "custom" | "free";
}

/** Billable addon kinds in the manual billing catalog. */
export type AddonKind = "extra_screen" | "extra_storage";

/** Offline / manual payment channels (bKash, Nagad, bank, etc.). */
export type BillingPaymentMethod = "bkash" | "nagad" | "bank" | "stripe" | "cash" | "other";

export type BillingInvoiceStatus =
  | "draft"
  | "open"
  | "payment_submitted"
  | "paid"
  | "void"
  | "canceled";

export type BillingInvoiceSource =
  | "manual_activation"
  | "addon_change"
  | "renewal"
  | "custom";

export type BillingInvoiceLineKind = "plan" | "addon" | "custom" | "credit";

/** Catalog addon (public.addon_templates). */
export interface AddonTemplate {
  id: string;
  name: string;
  description: string;
  kind: AddonKind;
  device_delta: number;
  storage_delta_bytes: number;
  monthly_price_cents: number;
  monthly_price_gbp_cents: number;
  monthly_price_eur_cents: number;
  monthly_price_bdt_paisa: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Per-account manual billing settings (public.account_billing). */
export interface AccountBilling {
  account_id: string;
  currency: "USD" | "GBP" | "EUR" | "BDT";
  custom_monthly_amount_cents: number | null;
  base_device_limit: number | null;
  base_storage_limit_bytes: number | null;
  payment_verified_at: string | null;
  payment_method: BillingPaymentMethod | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Active or canceled addon on an account (public.account_addons). */
export interface AccountAddon {
  id: string;
  account_id: string;
  addon_template_id: string;
  quantity: number;
  unit_amount_cents: number;
  currency: "USD" | "GBP" | "EUR" | "BDT";
  status: "active" | "canceled";
  started_at: string;
  canceled_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Joined from addon_templates when loaded via summary APIs. */
  addon?: AddonTemplate | null;
}

/** In-app invoice (public.billing_invoices). */
export interface BillingInvoice {
  id: string;
  account_id: string;
  invoice_number: string;
  status: BillingInvoiceStatus;
  currency: "USD" | "GBP" | "EUR" | "BDT";
  subtotal_cents: number;
  total_cents: number;
  period_start: string | null;
  period_end: string | null;
  due_at: string | null;
  paid_at: string | null;
  source: BillingInvoiceSource;
  notes: string | null;
  payment_method: BillingPaymentMethod | null;
  payment_reference: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  lines?: BillingInvoiceLine[];
}

export interface BillingInvoiceLine {
  id: string;
  invoice_id: string;
  kind: BillingInvoiceLineKind;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  amount_cents: number;
  addon_template_id: string | null;
  account_addon_id: string | null;
  plan_template_id: string | null;
  sort_order: number;
  created_at: string;
}

/** A subscription plan in the admin-managed catalog (public.plan_templates). */
export interface PlanTemplate {
  id: string;
  name: string;
  tagline: string;
  device_limit: number;
  storage_limit_bytes: number;
  /** Price in USD cents to avoid float drift; divide by 100 to display. */
  monthly_price_cents: number;
  /** Optional strikethrough/anchor price in USD cents. */
  original_price_cents: number | null;
  /** Monthly price in GBP pence. */
  monthly_price_gbp_cents: number;
  /** Optional strikethrough/anchor price in GBP pence. */
  original_price_gbp_cents: number | null;
  /** Monthly price in EUR cents. */
  monthly_price_eur_cents: number;
  /** Optional strikethrough/anchor price in EUR cents. */
  original_price_eur_cents: number | null;
  /** Monthly price in BDT paisa (1 taka = 100 paisa). */
  monthly_price_bdt_paisa: number;
  /** Optional strikethrough/anchor price in BDT paisa. */
  original_price_bdt_paisa: number | null;
  /** Annual monthly-equivalent price in USD cents (e.g. $7/mo billed annually). */
  annual_monthly_price_cents: number;
  /** Annual monthly-equivalent price in GBP pence. */
  annual_monthly_price_gbp_cents: number;
  /** Annual monthly-equivalent price in EUR cents. */
  annual_monthly_price_eur_cents: number;
  /** Annual monthly-equivalent price in BDT paisa. */
  annual_monthly_price_bdt_paisa: number;
  /** Optional annual strikethrough anchor in USD cents (monthly-equivalent). */
  original_annual_monthly_price_cents: number | null;
  /** Optional annual strikethrough anchor in GBP pence. */
  original_annual_monthly_price_gbp_cents: number | null;
  /** Optional annual strikethrough anchor in EUR cents. */
  original_annual_monthly_price_eur_cents: number | null;
  /** Optional annual strikethrough anchor in BDT paisa. */
  original_annual_monthly_price_bdt_paisa: number | null;
  cta_label: string;
  features: string[];
  badge: string | null;
  is_highlighted: boolean;
  is_active: boolean;
  sort_order: number;
  /** Stripe Product id (USD catalog sync). */
  stripe_product_id?: string | null;
  /** Stripe Price id for monthly billing. */
  stripe_price_monthly_id?: string | null;
  /** Stripe Price id for annual billing. */
  stripe_price_annual_id?: string | null;
  created_at: string;
  updated_at: string;
}

/** Row returned by admin_directory_stats() RPC. */
export interface AdminDirectoryStats {
  client_count: number;
  device_count: number;
  online_device_count: number;
  disabled_count: number;
  active_trial_count?: number;
  expired_trial_count?: number;
}

export interface PlatformStaff {
  user_id: string;
  email: string;
  display_name: string | null;
  role: "owner" | "operator" | "viewer";
  is_active: boolean;
  created_at: string;
}

/** Row returned by admin_list_admins() RPC. */
export interface AdminDirectoryEntry {
  user_id: string;
  email: string;
  display_name: string | null;
  role: PlatformStaff["role"];
  is_active: boolean;
  created_at: string;
}

/** Row returned by admin_list_users() RPC. */
export interface AdminUserDirectoryEntry {
  id: string;
  email: string;
  client_name: string | null;
  created_at: string;
  device_count: number;
  online_device_count: number;
  active_device_count: number;
  device_limit: number;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  is_disabled: boolean;
  /** True when the account also has admin portal access. */
  is_staff: boolean;
  /** Total rows matching the current admin list filter (paginated RPC only). */
  total_count?: number;
  /** True when the account was invited but has not completed first sign-in. */
  invitation_pending?: boolean;
  trial_ends_at?: string | null;
  plan_kind?: string | null;
  trial_expired?: boolean;
}

/** Row returned by admin_list_waitlist() RPC. */
export interface AccessWaitlistEntry {
  id: string;
  email: string;
  company_name: string | null;
  screen_count: number | null;
  message: string | null;
  status: "pending" | "reviewed" | "invited" | "dismissed";
  created_at: string;
  reviewed_at: string | null;
  total_count?: number;
}

/** Row returned by admin_list_audit_log() RPC. */
export interface AdminAuditLogEntry {
  id: string;
  action: string;
  actor_id: string;
  actor_email: string;
  actor_display_name: string | null;
  target_user_id: string | null;
  target_email: string | null;
  target_client_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  /** Total rows matching the current filter (paginated RPC only). */
  total_count?: number;
}

/** TV-reported diagnostics (varies by app version); see Android `DeviceTelemetryCollector`. */
export type DeviceTelemetry = Record<string, unknown>;

export interface Device {
  id: string;
  /** Short opaque base62 code used in dashboard URLs (/screens/{public_code}). */
  public_code: string;
  owner_id: string | null;
  /** Workspace this screen belongs to (null only for unclaimed devices). */
  workspace_id?: string | null;
  registered_session_id: string | null;
  pairing_code: string;
  name: string;
  status: DeviceStatus;
  last_seen: string | null;
  created_at: string;
  /** Preferred playback orientation; default landscape when omitted (pre-migration rows). */
  screen_orientation?: DeviceScreenOrientation;
  /** Last payload from the screen app (JSON). */
  telemetry?: DeviceTelemetry | null;
  /** When `telemetry` was last written. */
  telemetry_at?: string | null;
  /** When true, the TV shows standby branding instead of the assigned playlist. */
  playback_disabled?: boolean;
  /** Paused because the client exceeded their screen plan limit. */
  paused_by_quota?: boolean;
  /** Optional thumbnail image in object storage (not counted in media library quota). */
  thumbnail_storage_path?: string | null;
  /** When the console last asked this screen to capture a live frame. */
  screenshot_requested_at?: string | null;
  /** When the TV last uploaded a live screenshot. */
  live_screenshot_at?: string | null;
  /** Optional labels for organizing and filtering screens. */
  tags?: string[];
  /** Optional subtitle shown under the screen name in the console. */
  description?: string | null;
  /** Weekly local-time windows when this screen is in use. */
  operating_hours?: WeeklySchedule;
  /** IANA timezone for operating hours and item daily schedules. */
  operating_hours_timezone?: string;
  /** When true, timezone is synced from the TV; false after admin saves Hours. */
  operating_hours_timezone_auto?: boolean;
  /** When true, TV blanks outside operating hours. */
  blank_when_off_hours?: boolean;
  /** When true, screen is active outside configured hours (inverted schedule). */
  operating_hours_inverted?: boolean;
  /** Client type; defaults to android for pre-migration rows. */
  platform?: DevicePlatform;
}

export interface AppRelease {
  id: string;
  version_code: number;
  version_name: string;
  storage_path: string;
  sha256: string;
  release_notes: string | null;
  is_active: boolean;
  package_name: string;
  created_at: string;
  created_by: string | null;
}

export interface Media {
  id: string;
  owner_id: string;
  /** Workspace this file belongs to. */
  workspace_id?: string | null;
  storage_path: string;
  file_type: MediaFileType;
  original_filename: string | null;
  created_at: string;
  /** File size in bytes at upload. */
  size_bytes?: number;
  /** Video intrinsic length in seconds; null for images or not yet probed. */
  duration_seconds?: number | null;
  /** Optional subtitle for this file in the console. */
  description?: string | null;
  /** Optional labels for organizing and filtering content. */
  tags?: string[];
  /** Optional start date after which this content may be shown. */
  display_from?: string | null;
  /** Optional expiry date after which this content should not be shown. */
  display_until?: string | null;
  /** Intrinsic width in pixels; null until probed. */
  width_pixels?: number | null;
  /** Intrinsic height in pixels; null until probed. */
  height_pixels?: number | null;
}

export type PlaylistTransitionStyle = "none" | "fade" | "dissolve";

export interface Playlist {
  id: string;
  owner_id: string;
  /** Workspace this playlist belongs to. */
  workspace_id?: string | null;
  name: string;
  created_at: string;
  transition_style?: PlaylistTransitionStyle;
  shuffle_enabled?: boolean;
}

export interface PlaylistItem {
  id: string;
  playlist_id: string;
  media_id: string | null;
  website_id?: string | null;
  sort_order: number;
  /** Image dwell time in seconds; ignored for video (always plays to completion). */
  duration_seconds: number | null;
  display_from: string | null;
  display_until: string | null;
  created_at: string;
  /** When true, item only plays during daily_schedule windows. */
  daily_schedule_enabled?: boolean;
  daily_schedule?: WeeklySchedule | null;
}

export interface DevicePlaylist {
  id: string;
  device_id: string;
  playlist_id: string;
  is_active: boolean;
  updated_at: string;
}

export interface DeviceGroup {
  id: string;
  owner_id: string;
  /** Workspace this group belongs to. */
  workspace_id?: string | null;
  name: string;
  /** Hex accent for UI chips, e.g. #047857 */
  accent_color: string | null;
  /** Shared playlist played on all screens in this group. */
  playlist_id: string | null;
  created_at: string;
}

export interface DeviceGroupMember {
  id: string;
  group_id: string;
  device_id: string;
  created_at: string;
}

export interface PlaylistGroup {
  id: string;
  owner_id: string;
  /** Workspace this group belongs to. */
  workspace_id?: string | null;
  name: string;
  /** Hex accent for UI chips, e.g. #047857 */
  accent_color: string | null;
  created_at: string;
}

export interface PlaylistGroupMember {
  id: string;
  group_id: string;
  playlist_id: string;
  created_at: string;
}

export interface MediaGroup {
  id: string;
  owner_id: string;
  /** Workspace this folder belongs to. */
  workspace_id?: string | null;
  name: string;
  /** Hex accent for UI chips, e.g. #047857 */
  accent_color: string | null;
  /** Parent folder; null = library root */
  parent_id: string | null;
  created_at: string;
}

export interface MediaGroupMember {
  id: string;
  group_id: string;
  media_id: string;
  created_at: string;
}

export type WebsiteSourceType = "url" | "html" | "file";
export type WebsiteThumbnailStatus = "pending" | "ready" | "failed";

export interface Website {
  id: string;
  owner_id: string;
  /** Workspace this website belongs to. */
  workspace_id?: string | null;
  name: string;
  source_type: WebsiteSourceType;
  url: string | null;
  html_content: string | null;
  storage_path: string | null;
  playback_url: string;
  thumbnail_storage_path: string | null;
  thumbnail_status: WebsiteThumbnailStatus | null;
  description: string | null;
  tags: string[];
  zoom_level: number;
  display_from: string | null;
  display_until: string | null;
  created_at: string;
  updated_at: string;
}

/** Joined website metadata on playlist items (subset of Website). */
export type PlaylistItemWebsite = Pick<
  Website,
  | "id"
  | "name"
  | "source_type"
  | "playback_url"
  | "url"
  | "zoom_level"
  | "display_from"
  | "display_until"
  | "created_at"
  | "thumbnail_storage_path"
>;

/** Payload used by the playlist editor (joins media or website metadata). */
export interface PlaylistItemWithMedia extends PlaylistItem {
  media: Pick<
    Media,
    | "id"
    | "storage_path"
    | "file_type"
    | "original_filename"
    | "duration_seconds"
    | "display_from"
    | "display_until"
  > | null;
  website?: PlaylistItemWebsite | null;
}

// ---------------------------------------------------------------------------
// Workspace role / permission helpers (runtime)
// ---------------------------------------------------------------------------

/** Every permission a member can hold. Order drives the custom-permission UI. */
export const ALL_WORKSPACE_PERMISSIONS: readonly WorkspacePermission[] = [
  "view_screens",
  "manage_screens",
  "change_playlists",
  "view_content",
  "manage_content",
  "view_websites",
  "manage_websites",
  "administrator",
  "access_billing",
] as const;

/** Human-readable labels for the custom-permission checkboxes. */
export const WORKSPACE_PERMISSION_LABELS: Record<WorkspacePermission, string> = {
  view_screens: "View screens",
  manage_screens: "Add/delete/edit screens",
  change_playlists: "Change playlists",
  view_content: "View content library",
  manage_content: "Upload/delete/edit files",
  view_websites: "View websites",
  manage_websites: "Add/delete/edit websites",
  administrator: "Administrator",
  access_billing: "Access billing portal",
};

/** Grouped permissions for the custom-role section (matches the product UI). */
export const WORKSPACE_PERMISSION_GROUPS: ReadonlyArray<{
  label: string;
  permissions: readonly WorkspacePermission[];
}> = [
  { label: "Screens", permissions: ["view_screens", "manage_screens", "change_playlists"] },
  { label: "Content", permissions: ["view_content", "manage_content", "view_websites", "manage_websites"] },
  { label: "Account", permissions: ["administrator", "access_billing"] },
];

/** Role option metadata for the role dropdown. */
export const WORKSPACE_ROLE_OPTIONS: ReadonlyArray<{
  role: WorkspaceRole;
  label: string;
  description: string;
}> = [
  { role: "account_admin", label: "Account admin", description: "Full access including billing and user management" },
  { role: "admin", label: "Admin", description: "Full access including user management" },
  { role: "standard", label: "Standard", description: "Manage screens, content, and playlists" },
  { role: "content_manager", label: "Content manager", description: "Manage content and playlists" },
  { role: "custom", label: "Custom", description: "Choose individual permissions" },
];

const FULL_PERMISSIONS = [...ALL_WORKSPACE_PERMISSIONS];

/** Permission set granted by each non-custom role. */
const ROLE_PERMISSIONS: Record<Exclude<WorkspaceRole, "custom">, WorkspacePermission[]> = {
  owner: FULL_PERMISSIONS,
  account_admin: FULL_PERMISSIONS,
  admin: FULL_PERMISSIONS.filter((p) => p !== "access_billing"),
  standard: [
    "view_screens",
    "manage_screens",
    "change_playlists",
    "view_content",
    "manage_content",
    "view_websites",
    "manage_websites",
  ],
  content_manager: ["view_content", "manage_content", "view_websites", "manage_websites", "change_playlists"],
};

/** Resolves the effective permission set for a member's role + custom permissions. */
export function resolveWorkspacePermissions(
  role: WorkspaceRole,
  customPermissions: WorkspacePermission[] = [],
): Set<WorkspacePermission> {
  if (role === "custom") {
    return new Set(customPermissions);
  }
  return new Set(ROLE_PERMISSIONS[role]);
}

/** Whether a member with the given role/custom set holds a specific permission. */
export function workspaceRoleHasPermission(
  role: WorkspaceRole,
  permission: WorkspacePermission,
  customPermissions: WorkspacePermission[] = [],
): boolean {
  return resolveWorkspacePermissions(role, customPermissions).has(permission);
}
