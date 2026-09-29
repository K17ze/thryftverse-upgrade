/**
 * Settings search index — the web counterpart of the mobile
 * hooks/settings/settingsRouteMetadata.ts table. One entry per real
 * destination on the settings surface; `keywords` holds only synonyms not
 * already covered by the label or section title (the filter checks all
 * three fields, same as mobile's useSettingsSearch).
 *
 * Every target is real: a route, an index-sheet opener, or the theme
 * toggle — nothing here produces a dead row.
 */

import type { AppIconName } from '@/components/ui/Icon';

/** Sheets the settings index can open in place of a route. */
export type SettingsSheetId = 'language' | 'verification' | 'report' | 'age' | 'accent' | 'density';

const SHEET_IDS: readonly SettingsSheetId[] = [
  'language',
  'verification',
  'report',
  'age',
  'accent',
  'density',
];

/** Validates an untrusted value (e.g. the ?sheet= deep-link param the
 *  desktop rail emits) into a known sheet id. */
export function isSettingsSheetId(value: unknown): value is SettingsSheetId {
  return typeof value === 'string' && (SHEET_IDS as readonly string[]).includes(value);
}

export type SettingsTarget =
  | { kind: 'route'; href: string }
  | { kind: 'sheet'; sheet: SettingsSheetId }
  /** The dark-theme switch — lives on the index, so the result toggles it
   *  directly rather than navigating nowhere. */
  | { kind: 'theme' };

export interface SettingsDestination {
  id: string;
  label: string;
  /** Visible group name — mirrors SettingsSection titles so results stay
      consistent with the browsable hierarchy. */
  section: string;
  icon: AppIconName;
  keywords: string;
  target: SettingsTarget;
}

export const SETTINGS_DESTINATIONS: SettingsDestination[] = [
  // ── Your account ──
  { id: 'edit-profile', label: 'Edit profile', section: 'Your account', icon: 'edit', keywords: 'avatar name bio username photo public', target: { kind: 'route', href: '/profile/edit' } },
  { id: 'personal-info', label: 'Personal info', section: 'Your account', icon: 'profile', keywords: 'email phone date of birth private contact details', target: { kind: 'route', href: '/settings/personal' } },
  { id: 'security', label: 'Security', section: 'Your account', icon: 'key', keywords: 'password sign in two factor 2fa sessions devices revoke passkey', target: { kind: 'route', href: '/settings/security' } },
  { id: 'recovery-codes', label: 'Recovery codes', section: 'Your account', icon: 'lockOpen', keywords: 'backup codes two factor 2fa recovery one-time', target: { kind: 'route', href: '/settings/security/recovery' } },
  { id: 'connected-accounts', label: 'Connected accounts', section: 'Your account', icon: 'link', keywords: 'google apple facebook oauth linked social sign in', target: { kind: 'route', href: '/settings/security/connected' } },
  { id: 'account-control', label: 'Account control', section: 'Your account', icon: 'settings', keywords: 'delete download export restrict account control', target: { kind: 'route', href: '/settings/security/control' } },
  { id: 'verification', label: 'Verification', section: 'Your account', icon: 'verified', keywords: 'identity kyc id badge verified trust', target: { kind: 'sheet', sheet: 'verification' } },
  { id: 'age-confirmation', label: 'Age confirmation', section: 'Your account', icon: 'fingerprint', keywords: '18 adult age check', target: { kind: 'sheet', sheet: 'age' } },
  { id: 'privacy', label: 'Privacy', section: 'Your account', icon: 'shield', keywords: 'visibility blocked restricted safety chat who can message', target: { kind: 'route', href: '/settings/privacy' } },
  { id: 'data', label: 'Data & export', section: 'Your account', icon: 'download', keywords: 'download export consent delete account erase gdpr cookies', target: { kind: 'route', href: '/settings/data' } },
  { id: 'messaging', label: 'Messaging', section: 'Your account', icon: 'inbox', keywords: 'chat messages who can message read receipts muted archived requests quick replies', target: { kind: 'route', href: '/settings/messaging' } },
  // ── Buying & selling ──
  { id: 'balance', label: 'Thryft balance', section: 'Buying & selling', icon: 'wallet', keywords: 'wallet money payout available', target: { kind: 'route', href: '/wallet' } },
  { id: 'addresses', label: 'Addresses', section: 'Buying & selling', icon: 'location', keywords: 'delivery saved address', target: { kind: 'route', href: '/settings/addresses' } },
  { id: 'payments', label: 'Payments', section: 'Buying & selling', icon: 'card', keywords: 'card bank payment methods', target: { kind: 'route', href: '/settings/payments' } },
  { id: 'postage', label: 'Shipping preferences', section: 'Buying & selling', icon: 'box', keywords: 'postage carrier dispatch parcel', target: { kind: 'route', href: '/settings/postage' } },
  { id: 'seller-hub', label: 'Seller hub', section: 'Buying & selling', icon: 'dashboard', keywords: 'listings orders payouts selling', target: { kind: 'route', href: '/seller-hub' } },
  { id: 'holiday-mode', label: 'Holiday mode', section: 'Buying & selling', icon: 'bag', keywords: 'away pause shop vacation sellers hide listings shop activity', target: { kind: 'route', href: '/seller-hub/settings' } },
  // ── Notifications ──
  { id: 'notifications', label: 'Notifications', section: 'Notifications', icon: 'notifications', keywords: 'push email alerts quiet hours price drops offers likes messages marketing pause', target: { kind: 'route', href: '/settings/notifications' } },
  // ── Experience ──
  { id: 'theme', label: 'Dark theme', section: 'Experience', icon: 'moon', keywords: 'appearance light mode display', target: { kind: 'theme' } },
  { id: 'accent', label: 'Accent colour', section: 'Experience', icon: 'palette', keywords: 'color appearance highlight brand sage clay slate plum', target: { kind: 'sheet', sheet: 'accent' } },
  { id: 'density', label: 'Density', section: 'Experience', icon: 'layers', keywords: 'compact regular editorial layout spacing room', target: { kind: 'sheet', sheet: 'density' } },
  { id: 'personalisation', label: 'Personalisation', section: 'Experience', icon: 'options', keywords: 'content preferences audience gender size brand members discovery feed', target: { kind: 'route', href: '/settings/personalisation' } },
  { id: 'language', label: 'Language', section: 'Experience', icon: 'language', keywords: 'locale region english', target: { kind: 'sheet', sheet: 'language' } },
  { id: 'accessibility', label: 'Accessibility', section: 'Experience', icon: 'accessibility', keywords: 'text size reduce motion high contrast screen reader zoom', target: { kind: 'route', href: '/settings/accessibility' } },
  { id: 'feed', label: 'Your feed', section: 'Experience', icon: 'feed', keywords: 'algorithm recommendations topics signals', target: { kind: 'route', href: '/agents/algorithm' } },
  { id: 'sustainability', label: 'Sustainability', section: 'Experience', icon: 'leaf', keywords: 'impact carbon environment circular', target: { kind: 'route', href: '/settings/sustainability' } },
  // ── Connected services ──
  { id: 'agents', label: 'AI agents', section: 'Connected services', icon: 'sparkles', keywords: 'assistants automation bots helpers', target: { kind: 'route', href: '/agents' } },
  // ── Help & legal ──
  { id: 'help', label: 'Help centre', section: 'Help & legal', icon: 'help', keywords: 'faq support contact questions', target: { kind: 'route', href: '/help' } },
  { id: 'support', label: 'Support centre', section: 'Help & legal', icon: 'chat', keywords: 'cases resolution disputes claims', target: { kind: 'route', href: '/support' } },
  { id: 'report', label: 'Report a problem', section: 'Help & legal', icon: 'flag', keywords: 'bug issue broken feedback', target: { kind: 'sheet', sheet: 'report' } },
  { id: 'appeal', label: 'Appeal a decision', section: 'Help & legal', icon: 'shieldCheck', keywords: 'moderation suspension strike', target: { kind: 'route', href: '/appeal' } },
  { id: 'terms', label: 'Terms of service', section: 'Help & legal', icon: 'document', keywords: 'legal conditions', target: { kind: 'route', href: '/terms' } },
  { id: 'privacy-policy', label: 'Privacy policy', section: 'Help & legal', icon: 'lock', keywords: 'legal data protection', target: { kind: 'route', href: '/privacy' } },
  { id: 'about', label: 'About ThryftVerse', section: 'Help & legal', icon: 'info', keywords: 'version app info', target: { kind: 'route', href: '/about' } },
];

/** Substring match across label, section and keywords — the same triple
 *  field check the mobile useSettingsSearch hook performs. */
export function filterSettingsDestinations(query: string): SettingsDestination[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SETTINGS_DESTINATIONS.filter(
    (d) =>
      d.label.toLowerCase().includes(q) ||
      d.section.toLowerCase().includes(q) ||
      d.keywords.toLowerCase().includes(q),
  );
}
