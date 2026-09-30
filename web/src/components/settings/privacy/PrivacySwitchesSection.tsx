'use client';

import { Skeleton } from '@/components/ui/Skeleton';
import { SettingsRow } from '../SettingsRow';
import { Switch } from '../Switch';
import type { PrivacyFlag } from '@/lib/store/settingsPrefs';
import type { WhoCanMessage } from '@/lib/store/chatPrefs';

const PRIVACY_SWITCHES: { key: PrivacyFlag; label: string; sub: string }[] = [
  {
    key: 'privateProfile',
    label: 'Private profile',
    sub: 'Only people who follow you can see your closet, looks and boards',
  },
  {
    key: 'showActivity',
    label: 'Activity status',
    sub: "Show when you're online and recently active",
  },
  {
    key: 'searchVisible',
    label: 'Search visibility',
    sub: 'Allow others to find you in member search',
  },
];

const WHO_CAN_MESSAGE_LABEL: Record<WhoCanMessage, string> = {
  everyone: 'Everyone',
  following: 'People you follow',
  none: 'No one',
};

interface PrivacySwitchesSectionProps {
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  syncs: boolean;
  flagValues: Record<PrivacyFlag, boolean>;
  onSetFlag: (key: PrivacyFlag, value: boolean) => void;
  whoCanMessage: WhoCanMessage;
}

export function PrivacySwitchesSection({
  isLoading,
  isError,
  onRetry,
  syncs,
  flagValues,
  onSetFlag,
  whoCanMessage,
}: PrivacySwitchesSectionProps) {
  if (isLoading) {
    return (
      <div aria-busy aria-label="Loading privacy settings">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[52px] w-full rounded-none" />
        ))}
      </div>
    );
  }

  return (
    <>
      {PRIVACY_SWITCHES.map((row) => (
        <div key={row.key} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-body-emphasis text-text-primary">{row.label}</p>
            <p className="clamp-1 text-caption text-text-muted">{row.sub}</p>
          </div>
          <Switch
            checked={flagValues[row.key]}
            onChange={(v) => onSetFlag(row.key, v)}
            aria-label={row.label}
          />
        </div>
      ))}
      {syncs && isError ? (
        <div className="px-4 py-3 sm:px-5">
          <p className="text-caption text-text-muted">
            Couldn’t reach the server — showing this device’s saved posture.
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
      {/* The DM gate is server-enforced (allowMessagesFrom) and owned
          by the messaging surface — deep-link rather than keep a
          second, unbacked toggle. */}
      <SettingsRow
        icon="chat"
        label="Who can message me"
        subtitle="Managed in Messaging settings"
        value={WHO_CAN_MESSAGE_LABEL[whoCanMessage]}
        href="/settings/messaging"
      />
    </>
  );
}
