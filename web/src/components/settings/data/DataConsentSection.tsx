'use client';

import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '../Switch';
import type { DataFlag } from '@/lib/store/settingsPrefs';

const DATA_SWITCHES: { key: DataFlag; label: string; sub: string }[] = [
  {
    key: 'personalisedAds',
    label: 'Personalised ads',
    sub: 'Use your activity to tailor partner offers',
  },
  {
    key: 'analytics',
    label: 'Analytics',
    sub: 'Anonymous usage data that helps improve ThryftVerse',
  },
  {
    key: 'thirdPartySharing',
    label: 'Partner data sharing',
    sub: 'Anonymised aggregate data shared with partners',
  },
];

interface DataConsentSectionProps {
  loading: boolean;
  isError: boolean;
  onRetry: () => void;
  syncs: boolean;
  flagValues: Record<DataFlag, boolean>;
  onSyncFlag: (key: DataFlag, value: boolean) => void;
}

export function DataConsentSection({
  loading,
  isError,
  onRetry,
  syncs,
  flagValues,
  onSyncFlag,
}: DataConsentSectionProps) {
  if (loading) {
    return (
      <div aria-busy aria-label="Loading privacy controls">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[52px] w-full rounded-none" />
        ))}
      </div>
    );
  }

  return (
    <>
      {syncs && isError ? (
        <div className="px-4 py-3.5 sm:px-5">
          <p className="text-caption text-text-muted">
            Couldn’t reach the server — showing this device’s saved choices.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="pressable mt-1 inline-flex min-h-11 items-center text-caption font-semibold text-text-primary"
          >
            Try again
          </button>
        </div>
      ) : null}
      {DATA_SWITCHES.map((row) => (
        <div key={row.key} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-body-emphasis text-text-primary">{row.label}</p>
            <p className="clamp-1 text-caption text-text-muted">{row.sub}</p>
          </div>
          <Switch
            checked={flagValues[row.key]}
            onChange={(v) => onSyncFlag(row.key, v)}
            aria-label={row.label}
          />
        </div>
      ))}
    </>
  );
}
