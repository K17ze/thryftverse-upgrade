'use client';

import { SettingsSection } from '../SettingsSection';
import { Switch } from '../Switch';
import {
  GROUPS,
  type PrefRowDef,
} from './notificationsTypes';
import type {
  NotificationPrefKey,
  NotifChannel,
} from '@/lib/store/settingsPrefs';

function ColumnHeader({ hasPush, hasEmail }: { hasPush: boolean; hasEmail: boolean }) {
  return (
    <div className="flex items-center gap-2 border-b border-border-subtle px-4 pb-1.5 pt-2 sm:px-5">
      <span className="flex-1" />
      <span className="w-11 shrink-0 text-center text-meta font-semibold uppercase tracking-wide text-text-muted">
        {hasPush ? 'Push' : ''}
      </span>
      <span className="w-11 shrink-0 text-center text-meta font-semibold uppercase tracking-wide text-text-muted">
        {hasEmail ? 'Email' : ''}
      </span>
    </div>
  );
}

function MatrixRow({
  def,
  pushChecked,
  emailChecked,
  pushDisabled,
  emailDisabled,
  onPref,
}: {
  def: PrefRowDef;
  pushChecked: boolean;
  emailChecked: boolean;
  pushDisabled: boolean;
  emailDisabled: boolean;
  onPref: (channel: NotifChannel, key: NotificationPrefKey, v: boolean) => void;
}) {
  return (
    <div className="flex min-h-[52px] items-center gap-2 px-4 py-2.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-body-emphasis text-text-primary">{def.label}</p>
        <p className="clamp-1 text-caption text-text-muted">{def.sub}</p>
      </div>
      <span className="flex w-11 shrink-0 justify-center">
        {def.push ? (
          <Switch
            checked={pushChecked}
            onChange={(v) => onPref('push', def.key, v)}
            disabled={pushDisabled || def.locked}
            aria-label={`${def.label} — push`}
          />
        ) : (
          <span aria-hidden className="text-body text-text-muted">
            —
          </span>
        )}
      </span>
      <span className="flex w-11 shrink-0 justify-center">
        {def.email ? (
          <Switch
            checked={emailChecked}
            onChange={(v) => onPref('email', def.key, v)}
            disabled={emailDisabled || def.locked}
            aria-label={`${def.label} — email`}
          />
        ) : (
          <span aria-hidden className="text-body text-text-muted">
            —
          </span>
        )}
      </span>
    </div>
  );
}

interface NotificationMatrixSectionProps {
  push: Record<NotificationPrefKey, boolean>;
  email: Record<NotificationPrefKey, boolean>;
  pushOn: boolean;
  emailOn: boolean;
  onPref: (channel: NotifChannel, key: NotificationPrefKey, v: boolean) => void;
}

export function NotificationMatrixSection({
  push,
  email,
  pushOn,
  emailOn,
  onPref,
}: NotificationMatrixSectionProps) {
  return (
    <>
      {GROUPS.map((group) => {
        const hasPush = group.rows.some((r) => r.push);
        const hasEmail = group.rows.some((r) => r.email);
        return (
          <SettingsSection key={group.title} title={group.title}>
            <ColumnHeader hasPush={hasPush} hasEmail={hasEmail} />
            <div className="divide-y divide-border-subtle">
              {group.rows.map((def) => (
                <MatrixRow
                  key={def.key}
                  def={def}
                  pushChecked={push[def.key]}
                  emailChecked={email[def.key]}
                  pushDisabled={!pushOn && !def.locked}
                  emailDisabled={!emailOn && !def.locked}
                  onPref={onPref}
                />
              ))}
            </div>
          </SettingsSection>
        );
      })}
    </>
  );
}
