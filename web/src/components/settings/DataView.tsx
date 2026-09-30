'use client';

/**
 * DataView — the /settings/data surface.
 *
 * Web deepening of the mobile DataPrivacyScreen + DataExportScreen +
 * DeleteAccountScreen:
 * - Consent toggles (ads, analytics, partner sharing).
 * - "Download your data": synchronous GDPR snapshot.
 * - Delete account: re-authentication + verification + erasure.
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SettingsSection } from './SettingsSection';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import {
  useSettingsPrefs,
  wirePrivacyConsent,
  type DataFlag,
} from '@/lib/store/settingsPrefs';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as usersService from '@/lib/api/services/users';
import { DataConsentSection } from './data/DataConsentSection';
import { DataExportSection } from './data/DataExportSection';
import { DeleteAccountRow } from './data/DeleteAccountRow';

const isLive = DATA_MODE === 'live';

export function DataView() {
  const hydrated = useHydrated();
  const { isGuest, sessionLoading } = useSession();
  const { show } = useToast();
  const personalisedAds = useSettingsPrefs((s) => s.personalisedAds);
  const analytics = useSettingsPrefs((s) => s.analytics);
  const recommendations = useSettingsPrefs((s) => s.recommendations);
  const thirdPartySharing = useSettingsPrefs((s) => s.thirdPartySharing);
  const setDataFlag = useSettingsPrefs((s) => s.setDataFlag);
  const syncDataConsent = useSettingsPrefs((s) => s.syncDataConsent);

  // The wire only exists for an authed live session — guests and fixture
  // mode keep the device-local mirror.
  const syncs = isLive && !isGuest;
  const liveConsent = useQuery({
    queryKey: ['users', 'me', 'consent'],
    queryFn: ({ signal }) => usersService.fetchPrivacyConsent(signal),
    enabled: syncs,
    staleTime: 30_000,
  });

  // Reconcile server truth into the mirror whenever the read lands.
  useEffect(() => {
    if (liveConsent.data) syncDataConsent(liveConsent.data);
  }, [liveConsent.data, syncDataConsent]);

  const flagValues: Record<DataFlag, boolean> = {
    personalisedAds,
    analytics,
    recommendations,
    thirdPartySharing,
  };

  /** Optimistic toggle → PATCH the full wire projection */
  const syncFlag = (key: DataFlag, v: boolean) => {
    setDataFlag(key, v);
    if (!syncs) return;
    void usersService
      .updatePrivacyConsent(wirePrivacyConsent(useSettingsPrefs.getState()))
      .catch((error) => {
        setDataFlag(key, !v);
        const parsed = parseApiError(error);
        show(
          parsed.isNetworkError
            ? parsed.message
            : 'Couldn’t save — the choice was restored',
          'error',
        );
      });
  };

  const loading = !hydrated || (isLive && sessionLoading) || (syncs && liveConsent.isLoading);

  return (
    <>
      <SettingsSection title="Privacy controls">
        <DataConsentSection
          loading={loading}
          isError={liveConsent.isError}
          onRetry={() => void liveConsent.refetch()}
          syncs={syncs}
          flagValues={flagValues}
          onSyncFlag={syncFlag}
        />
      </SettingsSection>

      <SettingsSection title="Your data">
        <DataExportSection />
      </SettingsSection>

      <div className="mt-8 border-y border-border-subtle">
        <DeleteAccountRow />
      </div>

      <p className="px-4 pt-5 text-caption text-text-muted sm:px-5">
        {syncs
          ? 'Consent choices are recorded against your account — they apply on every device you sign in to.'
          : isLive
            ? 'Consent choices are stored on this device — sign in to record them against your account.'
            : 'In this preview, consent choices are stored on this device only.'}
      </p>
    </>
  );
}

// Backwards-compatible re-export for consumers importing DeleteAccountRow directly
export { DeleteAccountRow } from './data/DeleteAccountRow';
