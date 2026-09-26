'use client';

/**
 * Settings surface — orchestrator. Grouped hairline rows on a flat canvas;
 * destinations that exist navigate, the rest open focused sheets.
 * Theme toggle writes localStorage 'thryftverse.theme' +
 * document.documentElement.dataset.theme — same contract as providers.tsx.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { Switch } from './Switch';
import { LanguageSheet, VerificationSheet, ReportSheet } from './SettingsSheets';
import { AgeConfirmationSheet } from './AgeConfirmationSheet';
import { useSession } from '@/lib/session/SessionProvider';
import { useToast } from '@/components/ui/Toast';

const THEME_KEY = 'thryftverse.theme';

type SheetId = 'language' | 'verification' | 'report' | 'age' | null;

export function SettingsView() {
  const router = useRouter();
  const { signOut, isGuest } = useSession();
  const { show } = useToast();
  const [sheet, setSheet] = useState<SheetId>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [language, setLanguage] = useState('English (UK)');

  // Hydrate from the document — providers.tsx resolves stored/system theme.
  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (current === 'light' || current === 'dark') setTheme(current);
  }, []);

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

  return (
    <>
      <SettingsSection title="Account">
        <SettingsRow icon="edit" label="Edit profile" href="/profile" />
        <SettingsRow icon="location" label="Addresses" href="/settings/addresses" />
        <SettingsRow icon="card" label="Payments" href="/settings/payments" />
        <SettingsRow
          icon="fingerprint"
          label="Age confirmation"
          onClick={() => setSheet('age')}
        />
      </SettingsSection>

      <SettingsSection title="Preferences">
        <SettingsRow icon="notifications" label="Notifications" href="/settings/notifications" />
        <SettingsRow icon="accessibility" label="Accessibility" href="/settings/accessibility" />
        <SettingsRow icon="leaf" label="Sustainability" href="/settings/sustainability" />
        <SettingsRow
          icon="language"
          label="Language"
          value={language}
          onClick={() => setSheet('language')}
        />
        <SettingsRow
          icon="moon"
          label="Dark theme"
          trailing={
            <Switch
              checked={theme === 'dark'}
              onChange={setThemeMode}
              aria-label="Dark theme"
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="Privacy & security">
        <SettingsRow icon="shield" label="Privacy" href="/settings/privacy" />
        <SettingsRow icon="key" label="Security" href="/settings/security" />
        <SettingsRow icon="download" label="Data & export" href="/settings/data" />
      </SettingsSection>

      <SettingsSection title="Selling">
        <SettingsRow icon="dashboard" label="Seller hub" href="/seller-hub" />
        <SettingsRow icon="verified" label="Verification" onClick={() => setSheet('verification')} />
        <SettingsRow icon="box" label="Shipping preferences" href="/settings/postage" />
      </SettingsSection>

      <SettingsSection title="Support">
        <SettingsRow icon="help" label="Help centre" href="/help" />
        <SettingsRow icon="flag" label="Report a problem" onClick={() => setSheet('report')} />
        <SettingsRow icon="shieldCheck" label="Appeal a decision" href="/appeal" />
        <SettingsRow icon="info" label="About" href="/about" />
      </SettingsSection>

      <div className="mt-8 border-y border-border-subtle">
        <SettingsRow
          icon={isGuest ? 'profile' : 'lockOpen'}
          label={isGuest ? 'Sign in' : 'Sign out'}
          danger={!isGuest}
          onClick={isGuest ? () => router.push('/auth') : handleSignOut}
        />
      </div>

      <p className="px-4 pb-4 pt-6 text-center text-meta text-text-muted sm:px-5">
        ThryftVerse 1.0 · Made for circular fashion
      </p>

      <LanguageSheet
        open={sheet === 'language'}
        onClose={() => setSheet(null)}
        value={language}
        onChange={setLanguage}
      />
      <VerificationSheet open={sheet === 'verification'} onClose={() => setSheet(null)} />
      <ReportSheet open={sheet === 'report'} onClose={() => setSheet(null)} />
      <AgeConfirmationSheet open={sheet === 'age'} onClose={() => setSheet(null)} />
    </>
  );
}
