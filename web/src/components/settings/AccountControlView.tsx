'use client';

/**
 * AccountControlView — /settings/security/control.
 *
 * Mirrors the mobile AccountControlScreen (data export) plus the account
 * lifecycle states the mobile delete/deactivate entry points imply:
 * - Account status: Active / Deactivated, persisted — deactivation is
 *   reversible from this page.
 * - Restricted accounts row → the existing privacy surface (that list is
 *   the real restricted state; no duplicate manager here).
 * - Download your data → the real JSON export on /settings/data.
 * - Delete account → the same typed-confirmation ritual as /settings/data.
 */

import { useState } from 'react';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { DeleteAccountRow } from './DataView';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmSheet, type ConfirmSheetState } from '@/components/orders/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';

export function AccountControlView() {
  const { show } = useToast();
  const hydrated = useHydrated();
  const accountStatus = useSettingsPrefs((s) => s.accountStatus);
  const deactivatedAt = useSettingsPrefs((s) => s.deactivatedAt);
  const deactivateAccount = useSettingsPrefs((s) => s.deactivateAccount);
  const reactivateAccount = useSettingsPrefs((s) => s.reactivateAccount);
  const restrictedCount = useSettingsPrefs((s) => s.restrictedIds.length);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);

  const deactivated = hydrated && accountStatus === 'deactivated';

  const requestDeactivate = () =>
    setConfirm({
      title: 'Deactivate your account?',
      message:
        'Your profile, listings and closet hide from other members, and messages pause. Nothing is deleted — reactivate any time to pick up where you left off.',
      confirmLabel: 'Deactivate',
      variant: 'destructive',
      onConfirm: () => {
        setConfirm(null);
        deactivateAccount();
        show('Account deactivated on this device', 'info');
      },
    });

  return (
    <>
      {/* Status — plain-language state, no scores or badges. */}
      <SettingsSection title="Status">
        {hydrated ? (
          <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
            <Icon
              name={deactivated ? 'pause' : 'check'}
              size={20}
              filled={!deactivated}
              className={deactivated ? 'shrink-0 text-warning-text' : 'shrink-0 text-success-text'}
            />
            <div className="min-w-0 flex-1">
              <p className="text-body-emphasis text-text-primary">
                {deactivated ? 'Account deactivated' : 'Account active'}
              </p>
              <p className="clamp-1 text-caption text-text-muted">
                {deactivated && deactivatedAt
                  ? `Since ${new Date(deactivatedAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })} — hidden from other members`
                  : 'Your profile, listings and messages are live'}
              </p>
            </div>
            {deactivated ? (
              <Button variant="secondary" size="sm" onClick={() => {
                reactivateAccount();
                show('Welcome back — your account is live again', 'success');
              }}>
                Reactivate
              </Button>
            ) : null}
          </div>
        ) : (
          <Skeleton className="h-[52px] w-full rounded-none" />
        )}
      </SettingsSection>

      <SettingsSection title="Your account">
        <SettingsRow
          icon="eyeOff"
          label="Restricted accounts"
          subtitle="Members whose messages go to requests"
          value={hydrated && restrictedCount > 0 ? String(restrictedCount) : undefined}
          href="/settings/privacy"
        />
        <SettingsRow
          icon="download"
          label="Download your data"
          subtitle="A JSON export of everything this session holds"
          href="/settings/data"
        />
      </SettingsSection>

      {/* Destructive zone — separated, mirroring the settings hub. */}
      <div className="mt-8 border-y border-border-subtle">
        {!deactivated ? (
          <SettingsRow
            icon="pause"
            label="Deactivate account"
            subtitle="Hide your account until you come back — reversible"
            danger
            onClick={requestDeactivate}
          />
        ) : null}
        <DeleteAccountRow />
      </div>

      <p className="px-4 pt-5 text-caption text-text-muted sm:px-5">
        {deactivated
          ? 'In this build deactivation is recorded on this device. A production build also hides your profile and listings platform-wide and reactivates automatically on sign-in.'
          : 'Deactivation pauses your presence — your profile, listings and closet hide until you reactivate. Deletion is permanent and separate.'}
      </p>

      <ConfirmSheet sheet={confirm} onDismiss={() => setConfirm(null)} />
    </>
  );
}
