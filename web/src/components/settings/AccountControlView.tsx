'use client';

/**
 * AccountControlView — /settings/security/control.
 *
 * Mirrors the mobile AccountControlScreen (data export) plus the account
 * deletion entry point:
 * - Restricted accounts row → the existing privacy surface (that list is
 *   the real restricted state; no duplicate manager here).
 * - Download your data → the export on /settings/data.
 * - Delete account → the same typed-confirmation ritual as /settings/data
 *   (live mode re-authenticates and issues DELETE /users/me).
 *
 * There is deliberately no deactivate control: the backend has no
 * deactivate endpoint (native doesn't ship one either), and a device-local
 * flag claiming platform-wide hiding would be a lie. Signing out is the
 * honest "step away" path.
 */

import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { DeleteAccountRow } from './DataView';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { DATA_MODE } from '@/lib/api/client';

const isLive = DATA_MODE === 'live';

export function AccountControlView() {
  const hydrated = useHydrated();
  const restrictedCount = useSettingsPrefs((s) => s.restrictedIds.length);

  return (
    <>
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
          subtitle={
            isLive
              ? 'A JSON export of everything your account holds'
              : 'A JSON export of everything this device holds'
          }
          href="/settings/data"
        />
      </SettingsSection>

      {/* Destructive zone — separated, mirroring the settings hub. */}
      <div className="mt-8 border-y border-border-subtle">
        <DeleteAccountRow />
      </div>

      <p className="px-4 pt-5 text-caption text-text-muted sm:px-5">
        {isLive
          ? 'Deletion is permanent — it removes your profile, listings, orders and messages platform-wide and can’t be undone. To step away without deleting, sign out instead.'
          : 'In this preview, deletion clears this device’s local preview data and signs you out — no server records exist to erase.'}
      </p>
    </>
  );
}
