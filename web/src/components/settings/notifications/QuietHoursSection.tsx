'use client';

import { SettingsSection } from '../SettingsSection';
import { Switch } from '../Switch';
import { formatHour, HOURS } from './notificationsTypes';
import type { QuietHours } from '@/lib/store/settingsPrefs';

interface QuietHoursSectionProps {
  quietHours: QuietHours;
  onSyncQuietHours: (patch: Partial<QuietHours>) => void;
}

export function QuietHoursSection({
  quietHours,
  onSyncQuietHours,
}: QuietHoursSectionProps) {
  const selectClass =
    'h-11 rounded-md border border-border bg-input px-2 text-body text-input-text focus:border-text-muted focus:outline-none';

  return (
    <SettingsSection title="Quiet hours">
      <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="text-body-emphasis text-text-primary">Do Not Disturb</p>
          <p className="text-caption text-text-muted">
            {quietHours.enabled
              ? `Push silenced ${formatHour(quietHours.startHour)} – ${formatHour(quietHours.endHour)}`
              : 'Silence non-urgent push overnight'}
          </p>
        </div>
        <Switch
          checked={quietHours.enabled}
          onChange={(v) => onSyncQuietHours({ enabled: v })}
          aria-label="Do Not Disturb"
        />
      </div>
      {quietHours.enabled ? (
        <div className="flex items-center gap-3 px-4 pb-4 pt-1 sm:px-5">
          <label className="flex items-center gap-2 text-caption text-text-muted">
            From
            <select
              aria-label="Quiet hours start"
              value={quietHours.startHour}
              onChange={(e) => onSyncQuietHours({ startHour: Number(e.target.value) })}
              className={selectClass}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {formatHour(h)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-caption text-text-muted">
            To
            <select
              aria-label="Quiet hours end"
              value={quietHours.endHour}
              onChange={(e) => onSyncQuietHours({ endHour: Number(e.target.value) })}
              className={selectClass}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {formatHour(h)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </SettingsSection>
  );
}
