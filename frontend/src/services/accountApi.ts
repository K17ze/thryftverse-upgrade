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
