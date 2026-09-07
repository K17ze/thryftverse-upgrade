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
    complianceProfile?: unknown;
    kycCases?: unknown[];
    amlAlerts?: unknown[];
    aiUsageEvents?: unknown[];
    gdprHistory?: unknown[];
  };
}

interface DeleteMyAccountResponse {
  ok: true;
  requestId: string;
  message: string;
}

export interface DataExportCategorySummary {
  key: string;
  label: string;
  count: number;
}

export interface DataExportResult {
  requestId: string;
  exportedAt: string | null;
  username: string | null;
  estimatedRecords: number;
  categories: DataExportCategorySummary[];
  exportPayload: unknown;
}

export interface DeleteAccountResult {
  requestId: string;
  message: string;
}

const EXPORT_CATEGORY_KEYS: { key: keyof RequestDataExportResponse['export']; label: string }[] = [
  { key: 'addresses', label: 'Addresses' },
  { key: 'paymentMethods', label: 'Payment methods' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'interactions', label: 'Interactions' },
  { key: 'orders', label: 'Orders' },
  { key: 'auctionBids', label: 'Auction bids' },
  { key: 'coOwnOrders', label: 'Co-own orders' },
  { key: 'coOwnHoldings', label: 'Co-own holdings' },
  { key: 'consents', label: 'Consents' },
  { key: 'kycCases', label: 'KYC cases' },
  { key: 'amlAlerts', label: 'AML alerts' },
  { key: 'aiUsageEvents', label: 'AI usage events' },
  { key: 'gdprHistory', label: 'GDPR requests' },
];

function summarizeExportCategories(
  payload: RequestDataExportResponse['export'] | undefined,
): DataExportCategorySummary[] {
  if (!payload) {
    return [];
  }

  return EXPORT_CATEGORY_KEYS.map(({ key, label }) => {
    const value = payload[key];
    return {
      key,
      label,
      count: Array.isArray(value) ? value.length : 0,
    };
  });
}

function countEstimatedRecords(payload: RequestDataExportResponse['export'] | undefined) {
  if (!payload) {
    return 0;
  }

  return EXPORT_CATEGORY_KEYS.reduce((total, { key }) => {
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
    categories: summarizeExportCategories(payload.export),
    exportPayload: payload.export ?? null,
  };
}

/**
 * Permanently delete the account with server-side re-authentication.
 *
 * Sends the user's current password, the typed confirmation phrase ("DELETE"),
 * an optional departure reason, and — when 2FA is enabled — the current TOTP
 * code. The backend verifies all of these before performing GDPR erasure.
 */
export async function requestAccountDeletion(
  password: string,
  confirmPhrase: string,
  reason?: string,
  totpCode?: string,
): Promise<DeleteAccountResult> {
  const payload = await fetchJson<DeleteMyAccountResponse>('/users/me', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reason: reason?.trim() || undefined,
      password: password || undefined,
      confirmPhrase: confirmPhrase?.trim() || undefined,
      totpCode: totpCode?.trim() || undefined,
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

export interface PostagePreferences {
  carrierKey: string;
  freeShipping: boolean;
  bundleDiscount: boolean;
}

export interface UpdatePostagePreferencesInput {
  carrierKey?: string;
  freeShipping?: boolean;
  bundleDiscount?: boolean;
}

export async function fetchPostagePreferences(): Promise<PostagePreferences> {
  const payload = await fetchJson<{ ok: true; postage: PostagePreferences }>('/users/me/postage');
  return payload.postage;
}

export async function updateUserPostagePreferences(input: UpdatePostagePreferencesInput): Promise<PostagePreferences> {
  const payload = await fetchJson<{ ok: true; postage: PostagePreferences }>('/users/me/postage', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return payload.postage;
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
  offersInChatEnabled: boolean;
  orderUpdatesInChatEnabled: boolean;
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
  auctionAlerts: boolean;
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