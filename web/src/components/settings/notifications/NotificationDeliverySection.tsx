'use client';

import { SettingsSection } from '../SettingsSection';
import { Switch } from '../Switch';

function MasterRow({
  label,
  on,
  paused,
  onChange,
}: {
  label: string;
  on: boolean;
  paused: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-body-emphasis text-text-primary">{label}</p>
        <p className="text-caption text-text-muted">
          {paused ? 'Paused — your categories are kept' : 'Alerts reach this account'}
        </p>
      </div>
      <Switch checked={on} onChange={onChange} aria-label={label} />
    </div>
  );
}

interface NotificationDeliverySectionProps {
  syncs: boolean;
  isError: boolean;
  onRetry: () => void;
  pushOn: boolean;
  emailOn: boolean;
  onSyncPushMaster: (v: boolean) => void;
  onSyncEmailMaster: (v: boolean) => void;
}

export function NotificationDeliverySection({
  syncs,
  isError,
  onRetry,
  pushOn,
  emailOn,
  onSyncPushMaster,
  onSyncEmailMaster,
}: NotificationDeliverySectionProps) {
  return (
    <SettingsSection title="Delivery">
      {syncs && isError ? (
        <div className="px-4 py-3.5 sm:px-5">
          <p className="text-caption text-text-muted">
            Couldn’t reach the server — showing this device’s saved preferences.
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
      <MasterRow
        label="Push notifications"
        on={pushOn}
        paused={!pushOn}
        onChange={onSyncPushMaster}
      />
      <MasterRow
        label="Email notifications"
        on={emailOn}
        paused={!emailOn}
        onChange={onSyncEmailMaster}
      />
    </SettingsSection>
  );
}
