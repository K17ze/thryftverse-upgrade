/**
 * Settings-domain fixtures — the account-security seed data the
 * /settings/security surfaces render before a live backend answers.
 * Sessions and linked accounts are the same records a real API would
 * return (redacted: no token material, no raw fingerprints); mutation
 * state (revoked/unlinked) lives in the persisted settings-prefs store so
 * revoking a session survives reload exactly like a server write would.
 */

import type { ConnectedAccount, SecuritySession } from '@/lib/contracts/settings';

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

export const SECURITY_SESSIONS: SecuritySession[] = [
  {
    id: 'sess-current',
    deviceName: 'This device — Chrome on Windows',
    platform: 'Web',
    ipAddress: '82.14.96.203',
    createdAt: iso(2 * 60 * 60 * 1000),
    lastSeenAt: iso(0),
    isCurrent: true,
  },
  {
    id: 'sess-iphone',
    deviceName: 'ThryftVerse app — iPhone 15',
    platform: 'iOS',
    ipAddress: '82.14.96.203',
    createdAt: iso(42 * 24 * 60 * 60 * 1000),
    lastSeenAt: iso(2 * 24 * 60 * 60 * 1000),
    isCurrent: false,
  },
  {
    id: 'sess-macbook',
    deviceName: 'Safari — MacBook Air',
    platform: 'Web',
    ipAddress: '86.170.44.18',
    createdAt: iso(90 * 24 * 60 * 60 * 1000),
    lastSeenAt: iso(7 * 24 * 60 * 60 * 1000),
    isCurrent: false,
  },
];

export const CONNECTED_ACCOUNTS: ConnectedAccountsSeed = {
  accounts: [
    {
      id: 'ca-google',
      provider: 'google',
      providerEmail: 'alex.morgan@gmail.com',
      linkedAt: iso(120 * 24 * 60 * 60 * 1000),
    },
  ],
  // The fixture account signed up with email + password — Change Password
  // exists on /settings/security, so a password credential is truthful.
  hasPassword: true,
};

interface ConnectedAccountsSeed {
  accounts: ConnectedAccount[];
  hasPassword: boolean;
}

/** Mobile `formatLastActive` (AccountSecurityScreen) — plain relative
 *  labels, never surveillance detail. */
export function formatSessionActivity(isoOrNull: string | null): string {
  if (!isoOrNull) return 'Unknown';
  const diffMs = Date.now() - new Date(isoOrNull).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Active now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(isoOrNull).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
