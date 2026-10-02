'use client';

/**
 * Settings surface — orchestrator. Mirrors the native SettingsScreen
 * structure: identity row + Thryft balance, then grouped hairline
 * sections (Your account → Buying & selling → Notifications →
 * Experience → Connected services → Help & legal) with the destructive
 * account actions separated at the bottom.
 *
 * Theme toggle writes localStorage 'thryftverse.theme' +
 * document.documentElement.dataset.theme — same contract as providers.tsx.
 * Decomposed into modular domain components (< 400 LOC standard):
 *  - SettingsSearch
 *  - SettingsIdentityRow
 *  - SettingsExperienceSection
 *  - SettingsModals
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { DeleteAccountRow } from './DataView';
import { SettingsSearch } from './SettingsSearch';
import { SettingsIdentityRow } from './SettingsIdentityRow';
import { SettingsExperienceSection } from './SettingsExperienceSection';
import { SettingsModals } from './SettingsModals';
import type { SettingsDestination, SettingsSheetId } from './settingsDestinations';
import { isSettingsSheetId, settingsSectionId } from './settingsDestinations';
import { useSession } from '@/lib/session/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import { useWalletData } from '@/components/wallet/useWalletData';
import { useHydrated } from '@/lib/store/useStore';
import { useDensity } from '@/lib/density';
import { useAccent } from '@/lib/accent';
import { useLocale } from '@/lib/i18n/useLocale';

const THEME_KEY = 'thryftverse.theme';
type SheetId = SettingsSheetId | null;

export function SettingsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, signOut, isGuest } = useSession();
  const { show } = useToast();
  const [sheet, setSheet] = useState<SheetId>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const { locale, locales } = useLocale();
  const language = locales.find((l) => l.code === locale)?.label ?? 'English';
  const [settingsQuery, setSettingsQuery] = useState('');
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  // The wallet row reads the same hook /wallet uses — live snapshot in
  // live mode, the shared fixture in fixture mode; no value while loading.
  const { data: wallet } = useWalletData();
  // Persisted display prefs — hydration-gated so SSR and the first client
  // render agree before the stored choice lands.
  const hydrated = useHydrated();
  const { density, setDensity } = useDensity();
  const { accent, setAccent } = useAccent();

  // Hydrate from the document — providers.tsx resolves stored/system theme.
  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (current === 'light' || current === 'dark') setTheme(current);
  }, []);

  // Desktop-rail deep links — sheet-backed destinations (language, accent,
  // density, …) arrive as /settings?sheet=… and open the matching index
  // sheet. The param is validated against the known sheet ids.
  const sheetParam = searchParams.get('sheet');
  useEffect(() => {
    if (isSettingsSheetId(sheetParam)) setSheet(sheetParam);
  }, [sheetParam]);

  /** Closing a sheet that was opened via ?sheet= also drops the param so
   *  the same rail link (or another sheet link) can open it again. */
  const closeSheet = () => {
    setSheet(null);
    if (sheetParam) router.replace('/settings', { scroll: false });
  };

  const setThemeMode = (dark: boolean) => {
    const next = dark ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(THEME_KEY, next);
  };

  const handleSignOut = () => {
    signOut();
    show('Signed out', 'info');
    router.push('/auth');
  };

  /** Search-result activation — routes push, index sheets open in place,
      and the theme row toggles directly (it lives on this page). */
  const activateDestination = (d: SettingsDestination) => {
    switch (d.target.kind) {
      case 'route':
        router.push(d.target.href);
        return;
      case 'sheet':
        setSheet(d.target.sheet);
        return;
      case 'theme':
        setThemeMode(theme !== 'dark');
        return;
    }
  };

  const searching = settingsQuery.trim().length > 0;

  return (
    <>
      <SettingsSearch
        query={settingsQuery}
        onQueryChange={setSettingsQuery}
        onActivate={activateDestination}
      />

      {searching ? null : (
        <>
          <SettingsIdentityRow
            user={user}
            isGuest={isGuest}
            wallet={wallet}
            onSignIn={() => router.push('/auth')}
          />

          <SettingsSection
            id={settingsSectionId('Your account')}
            title="Your account"
          >
            <SettingsRow icon="edit" label="Edit profile" href="/profile/edit" />
            <SettingsRow
              icon="profile"
              label="Personal info"
              subtitle="Email, phone and date of birth"
              href="/settings/personal"
            />
            <SettingsRow
              icon="key"
              label="Security"
              subtitle="Password, two-factor and sessions"
              href="/settings/security"
            />
            <SettingsRow
              icon="lockOpen"
              label="Recovery codes"
              subtitle="Backup codes for two-factor sign-in"
              href="/settings/security/recovery"
            />
            <SettingsRow
              icon="link"
              label="Connected accounts"
              subtitle="Google, Apple and Facebook sign-in"
              href="/settings/security/connected"
            />
            <SettingsRow
              icon="settings"
              label="Account control"
              subtitle="Restrict, export and delete"
              href="/settings/security/control"
            />
            <SettingsRow
              icon="verified"
              label="Verification"
              subtitle="Confirm your identity"
              onClick={() => setSheet('verification')}
            />
            <SettingsRow
              icon="fingerprint"
              label="Age confirmation"
              onClick={() => setSheet('age')}
            />
            <SettingsRow
              icon="shield"
              label="Privacy"
              subtitle="Visibility, blocked and restricted members"
              href="/settings/privacy"
            />
            <SettingsRow
              icon="inbox"
              label="Messaging"
              subtitle="Who can message you and chat privacy"
              href="/settings/messaging"
            />
            <SettingsRow
              icon="download"
              label="Data & export"
              subtitle="Consent choices and your data"
              href="/settings/data"
            />
          </SettingsSection>

          <SettingsSection
            id={settingsSectionId('Buying & selling')}
            title="Buying & selling"
          >
            <SettingsRow icon="location" label="Addresses" href="/settings/addresses" />
            <SettingsRow icon="card" label="Payments" href="/settings/payments" />
            <SettingsRow icon="box" label="Shipping preferences" href="/settings/postage" />
            <SettingsRow
              icon="dashboard"
              label="Seller hub"
              subtitle="Listings, orders and payouts"
              href="/seller-hub"
            />
            <SettingsRow
              icon="analytics"
              label="Creator analytics"
              subtitle="Views, engagement and earnings"
              href="/creator-analytics"
            />
            <SettingsRow
              icon="bag"
              label="Holiday mode"
              subtitle="Pause your shop while you're away"
              href="/seller-hub/settings"
            />
          </SettingsSection>

          <SettingsSection
            id={settingsSectionId('Notifications')}
            title="Notifications"
          >
            <SettingsRow
              icon="notifications"
              label="Notifications"
              subtitle="Push, email and quiet hours"
              href="/settings/notifications"
            />
          </SettingsSection>

          <SettingsExperienceSection
            theme={theme}
            setThemeMode={setThemeMode}
            hydrated={hydrated}
            accent={accent}
            density={density}
            language={language}
            onOpenSheet={setSheet}
          />

          <SettingsSection
            id={settingsSectionId('Connected services')}
            title="Connected services"
          >
            <SettingsRow
              icon="sparkles"
              label="AI agents"
              subtitle="Automated helpers for your closet"
              href="/agents"
            />
          </SettingsSection>

          <SettingsSection
            id={settingsSectionId('Help & legal')}
            title="Help & legal"
          >
            <SettingsRow icon="help" label="Help centre" href="/help" />
            <SettingsRow
              icon="chat"
              label="Support centre"
              subtitle="Cases and resolution centre"
              href="/support"
            />
            <SettingsRow
              icon="flag"
              label="Report a problem"
              onClick={() => setSheet('report')}
            />
            <SettingsRow icon="shieldCheck" label="Appeal a decision" href="/appeal" />
            <SettingsRow icon="document" label="Terms of service" href="/terms" />
            <SettingsRow icon="lock" label="Privacy policy" href="/privacy" />
            <SettingsRow icon="info" label="About ThryftVerse" href="/about" />
          </SettingsSection>

          {/* Destructive/account actions — separated at the bottom, mirroring
              the mobile "Account" group. Guests get the sign-in prompt at the
              top of the page instead of a destructive zone. */}
          {!isGuest ? (
            <div className="mt-8 border-y border-border-subtle">
              <SettingsRow
                icon="exit"
                label="Sign out"
                danger
                onClick={() => setSignOutConfirm(true)}
              />
              <DeleteAccountRow />
            </div>
          ) : null}

          <p className="px-4 pb-4 pt-6 text-center text-meta text-text-muted sm:px-5">
            ThryftVerse 1.0 · Made for circular fashion
          </p>
        </>
      )}

      <SettingsModals
        sheet={sheet}
        onCloseSheet={closeSheet}
        signOutConfirm={signOutConfirm}
        onDismissSignOut={() => setSignOutConfirm(false)}
        onConfirmSignOut={() => {
          setSignOutConfirm(false);
          handleSignOut();
        }}
        theme={theme}
        accent={accent}
        onSelectAccent={setAccent}
        density={density}
        onSelectDensity={setDensity}
      />
    </>
  );
}
