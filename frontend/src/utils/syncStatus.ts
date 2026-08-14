export type SyncStatusTone = 'live' | 'syncing' | 'offline';

export interface SyncStatus {
  tone: SyncStatusTone;
  label: string;
}

interface BackendSyncStatusInput {
  isSyncing: boolean;
  source: 'api' | 'mock' | 'fixture' | 'cache' | 'offline-cache';
  hasError: boolean;
  labels?: {
    syncing?: string;
    live?: string;
    error?: string;
    fallback?: string;
  };
}

const DEFAULT_LABELS = {
  syncing: 'Refreshing',
  live: 'Synced',
  error: 'Offline cache',
  fallback: 'Cached mode',
};

export function getBackendSyncStatus({
  isSyncing,
  source,
  hasError,
  labels,
}: BackendSyncStatusInput): SyncStatus {
  const resolvedLabels = {
    ...DEFAULT_LABELS,
    ...labels,
  };

  if (isSyncing) {
    return {
      tone: 'syncing',
      label: resolvedLabels.syncing,
    };
  }

  if (source === 'api') {
    return {
      tone: 'live',
      label: resolvedLabels.live,
    };
  }

  if (source === 'offline-cache' || hasError) {
    return {
      tone: 'offline',
      label: resolvedLabels.error,
    };
  }

  // 'mock' | 'fixture' | 'cache' — substituted/cached data, not live API.
  return {
    tone: 'offline',
    label: resolvedLabels.fallback,
  };
}