import { fetchJson } from '../lib/apiClient';

interface RequestDataExportResponse {
  ok: true;
  requestId: string;
  export: {
    exportedAt?: string;
    user?: {
      id?: string;
      username?: string;
    };
    addresses?: unknown[];
    paymentMethods?: unknown[];
    sessions?: unknown[];
    interactions?: unknown[];
    orders?: unknown[];
    auctionBids?: unknown[];
    coOwnOrders?: unknown[];
    coOwnHoldings?: unknown[];
    consents?: unknown[];
    kycCases?: unknown[];
    amlAlerts?: unknown[];
  };
}

interface DeleteMyAccountResponse {
  ok: true;
  requestId: string;
  message: string;
}

export interface DataExportResult {
  requestId: string;
  exportedAt: string | null;
  username: string | null;
  estimatedRecords: number;
}

export interface DeleteAccountResult {
  requestId: string;
  message: string;
}

function countEstimatedRecords(payload: RequestDataExportResponse['export'] | undefined) {
  if (!payload) {
    return 0;
  }

  const keys: Array<keyof RequestDataExportResponse['export']> = [
    'addresses',
    'paymentMethods',
    'sessions',
    'interactions',
    'orders',
    'auctionBids',
    'coOwnOrders',
    'coOwnHoldings',
    'consents',
    'kycCases',
    'amlAlerts',
  ];

  return keys.reduce((total, key) => {
    const value = payload[key];
    if (!Array.isArray(value)) {
      return total;
    }

    return total + value.length;
  }, 0);
}

export async function requestMyDataExport(): Promise<DataExportResult> {
  const payload = await fetchJson<RequestDataExportResponse>('/users/me/export');

  return {
    requestId: payload.requestId,
    exportedAt: payload.export?.exportedAt ?? null,
    username: payload.export?.user?.username ?? null,
    estimatedRecords: countEstimatedRecords(payload.export),
  };
}

export async function deleteMyAccount(reason?: string): Promise<DeleteAccountResult> {
  const payload = await fetchJson<DeleteMyAccountResponse>('/users/me', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason?.trim() || undefined }),
  });

  return {
    requestId: payload.requestId,
    message: payload.message,
  };
}

/**
 * Request permanent account deletion with identity re-confirmation.
 *
 * Sends the user's password, typed confirmation phrase, and optional departure
 * reason to `DELETE /users/me`. The backend GDPR erasure handler accepts the
 * `reason` field today; `password` and `confirmText` are forwarded so that when
 * the backend adds server-side re-authentication they are already in the
 * request body without a client round-trip.
 */
export async function requestAccountDeletion(
  password: string,
  confirmText: string,
  reason?: string,
): Promise<DeleteAccountResult> {
  const payload = await fetchJson<DeleteMyAccountResponse>('/users/me', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reason: reason?.trim() || undefined,
      password: password || undefined,
      confirmText: confirmText?.trim() || undefined,
    }),
  });

  return {
    requestId: payload.requestId,
    message: payload.message,
  };
}

/**
 * Request a GDPR data export. The backend processes the export synchronously
 * and returns the full payload inline (no async job or download URL).
 */
export async function requestDataExport(): Promise<DataExportResult> {
  return requestMyDataExport();
}

/**
 * Check the status of a data export. The backend `GET /users/me/export`
 * endpoint is synchronous — each call returns the current export snapshot with
 * a fresh request ID. When the backend adds an async job queue, this method
 * should poll a dedicated status endpoint instead.
 */
export async function checkDataExportStatus(_exportId?: string): Promise<DataExportResult> {
  return requestMyDataExport();
}

export interface UpdateProfileInput {
  displayName?: string;
  username?: string;
  bio?: string;
  location?: string;
  website?: string;
  phone?: string;
  avatar?: string;
}

export async function updateUserProfile(input: UpdateProfileInput): Promise<void> {
  await fetchJson<{ ok: true }>('/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export interface UpdateAccountPreferencesInput {
  holidayMode?: boolean;
  privateProfile?: boolean;
}

export async function updateUserAccountPreferences(input: UpdateAccountPreferencesInput): Promise<void> {
  await fetchJson<{ ok: true }>('/users/me/preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export interface UpdatePostagePreferencesInput {
  carrierKey?: string;
  freeShipping?: boolean;
  bundleDiscount?: boolean;
}

export async function updateUserPostagePreferences(input: UpdatePostagePreferencesInput): Promise<void> {
  await fetchJson<{ ok: true }>('/users/me/postage', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export interface UpdatePersonalisationInput {
  genderFilter?: string[];
  categoriesAndSizesPref?: string;
  brandsPref?: string;
  membersPref?: string;
}

export async function updateUserPersonalisation(input: UpdatePersonalisationInput): Promise<void> {
  await fetchJson<{ ok: true }>('/users/me/personalisation', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function fetchUserPersonalisation(): Promise<UpdatePersonalisationInput> {
  const payload = await fetchJson<{ ok: true; personalisation: UpdatePersonalisationInput }>('/users/me/personalisation');
  return payload.personalisation;
}

export interface SessionInfo {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  isCurrent: boolean;
  deviceName: string;
  platform: string;
}

export async function fetchActiveSessions(): Promise<SessionInfo[]> {
  const payload = await fetchJson<{ ok: true; sessions: SessionInfo[] }>('/users/me/sessions');
  return payload.sessions;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await fetchJson<{ ok: true }>(`/users/me/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}

export async function revokeOtherSessions(): Promise<number> {
  const payload = await fetchJson<{ ok: true; revokedCount: number }>('/users/me/sessions/others', {
    method: 'DELETE',
  });
  return payload.revokedCount;
}

/* ─── Chat Privacy Sync ─── */

export interface ChatPrivacySettings {
  readReceiptsEnabled: boolean;
  allowMessagesFrom: 'everyone' | 'following' | 'nobody';
}

export async function fetchChatPrivacy(): Promise<ChatPrivacySettings> {
  const payload = await fetchJson<{ ok: true; chatPrivacy: ChatPrivacySettings }>('/users/me/chat-privacy');
  return payload.chatPrivacy;
}

export async function updateChatPrivacy(updates: Partial<ChatPrivacySettings>): Promise<ChatPrivacySettings> {
  const payload = await fetchJson<{ ok: true; chatPrivacy: ChatPrivacySettings }>('/users/me/chat-privacy', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return payload.chatPrivacy;
}

/* ─── Privacy Preferences ─── */

export interface PrivacyPreferences {
  activityStatusVisible: boolean;
  searchVisibility: 'visible' | 'hidden';
}

export async function fetchPrivacyPreferences(): Promise<PrivacyPreferences> {
  const payload = await fetchJson<{ ok: true; privacyPreferences: PrivacyPreferences }>('/users/me/privacy-preferences');
  return payload.privacyPreferences;
}

/* ─── Activity Status ─── */

export async function updateActivityStatus(visible: boolean): Promise<boolean> {
  const payload = await fetchJson<{ ok: true; activityStatusVisible: boolean }>('/users/me/activity-status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visible }),
  });
  return payload.activityStatusVisible;
}

/* ─── Search Visibility ─── */

export async function updateSearchVisibility(visibility: 'visible' | 'hidden'): Promise<string> {
  const payload = await fetchJson<{ ok: true; searchVisibility: string }>('/users/me/search-visibility', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility }),
  });
  return payload.searchVisibility;
}

/* ─── Locale Preferences ─── */

export interface LocalePreferences {
  locale: string | null;
  currencyCode: string;
  regionCode: string | null;
}

export async function updateLocalePreferences(updates: Partial<{
  locale: string;
  currencyCode: string;
  regionCode: string;
}>): Promise<LocalePreferences> {
  const payload = await fetchJson<{ ok: true; locale: LocalePreferences }>('/users/me/locale', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return payload.locale;
}

/* ─── Connected Accounts ─── */

export interface ConnectedAccount {
  id: string;
  provider: 'google' | 'apple' | 'facebook';
  providerEmail: string | null;
  linkedAt: string;
  metadata: Record<string, unknown> | null;
}

export async function fetchConnectedAccounts(): Promise<ConnectedAccount[]> {
  const payload = await fetchJson<{ ok: true; accounts: ConnectedAccount[] }>('/users/me/connected-accounts');
  return payload.accounts;
}

export async function unlinkConnectedAccount(id: string): Promise<void> {
  await fetchJson<{ ok: true }>(`/users/me/connected-accounts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/* ─── Email Notification Preferences ─── */

export interface EmailPreferences {
  orderUpdates: boolean;
  messageNotifications: boolean;
  priceDropAlerts: boolean;
  newListingsFromFollowing: boolean;
  marketing: boolean;
  securityAlerts: boolean;
  distributionNotices: boolean;
  corporateActionNotices: boolean;
}

export async function fetchEmailPreferences(): Promise<EmailPreferences> {
  const payload = await fetchJson<{ ok: true; preferences: EmailPreferences }>('/users/me/email-preferences');
  return payload.preferences;
}

export async function updateEmailPreferences(updates: Partial<EmailPreferences>): Promise<void> {
  await fetchJson<{ ok: true }>('/users/me/email-preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}