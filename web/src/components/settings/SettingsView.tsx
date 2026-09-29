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
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { Switch } from './Switch';
import { LanguageSheet, VerificationSheet, ReportSheet } from './SettingsSheets';
import { AgeConfirmationSheet } from './AgeConfirmationSheet';
import { DeleteAccountRow } from './DataView';
import { SettingsSearch } from './SettingsSearch';
import { PickerSheet } from './PickerSheet';
import type { SettingsDestination, SettingsSheetId } from './settingsDestinations';
import { isSettingsSheetId } from './settingsDestinations';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useSession } from '@/lib/session/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import { useWalletData } from '@/components/wallet/useWalletData';
import { ConfirmSheet } from '@/components/orders/ConfirmSheet';
import { formatPrice } from '@/lib/utils/format';
import { useHydrated } from '@/lib/store/useStore';
import { useDensity, type Density } from '@/lib/density';
import { ACCENT_PRESETS, getAccentPreset, useAccent } from '@/lib/accent';
import { useLocale } from '@/lib/i18n/useLocale';

const DENSITY_OPTIONS: { value: Density; label: string; subtitle: string }[] = [
  { value: 'compact', label: 'Compact', subtitle: 'Tighter spacing — more on screen' },
  { value: 'regular', label: 'Regular', subtitle: 'The default ThryftVerse layout' },
  { value: 'editorial', label: 'Editorial', subtitle: 'Roomier, media-led spacing' },
];

const DENSITY_LABELS: Record<Density, string> = {
  compact: 'Compact',
  regular: 'Regular',
  editorial: 'Editorial',
};

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
      {/* Identity — compact flat row, mirrors the mobile header block.
          Guests get a sign-in prompt instead of a fake profile. */}
      {isGuest || !user ? (
        <div className="mb-8 border-y border-border-subtle">
          <SettingsRow
            icon="profile"
            label="Sign in to ThryftVerse"
            subtitle="Sync your wardrobe, bag and orders"
            onClick={() => router.push('/auth')}
          />
        </div>
      ) : (
        <div className="mb-8">
          <Link
            href="/profile"
            className="pressable flex min-h-[64px] w-full items-center gap-3 border-y border-border-subtle px-4 py-3 sm:px-5"
          >
            <Avatar src={user.avatar} name={user.username} size={44} />
            <span className="min-w-0 flex-1">
              <span className="clamp-1 block text-body-emphasis font-semibold text-text-primary">
                {user.username}
              </span>
              <span className="clamp-1 mt-0.5 block text-caption text-text-muted">
                View profile
              </span>
            </span>
            <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
          </Link>
          <SettingsRow
            icon="wallet"
            label="Thryft balance"
            subtitle="Available to spend"
            value={wallet ? formatPrice(wallet.available, wallet.currency) : undefined}
            href="/wallet"
          />
        </div>
      )}

      <SettingsSection title="Your account">
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

      <SettingsSection title="Buying & selling">
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
      </SettingsSection>

      <SettingsSection title="Notifications">
        <SettingsRow
          icon="notifications"
          label="Notifications"
          subtitle="Push, email and quiet hours"
          href="/settings/notifications"
        />
      </SettingsSection>

      <SettingsSection title="Experience">
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
        <SettingsRow
          icon="palette"
          label="Accent colour"
          value={hydrated ? getAccentPreset(accent)?.label : undefined}
          onClick={() => setSheet('accent')}
        />
        <SettingsRow
          icon="layers"
          label="Density"
          subtitle="How roomy lists and feeds feel"
          value={hydrated ? DENSITY_LABELS[density] : undefined}
          onClick={() => setSheet('density')}
        />
        <SettingsRow
          icon="language"
          label="Language"
          value={language}
          onClick={() => setSheet('language')}
        />
        <SettingsRow
          icon="options"
          label="Personalisation"
          subtitle="Audience, sizes, brands and members"
          href="/settings/personalisation"
        />
        <SettingsRow
          icon="accessibility"
          label="Accessibility"
          subtitle="Text size, motion and contrast"
          href="/settings/accessibility"
        />
        <SettingsRow
          icon="feed"
          label="Your feed"
          subtitle="Tune what your feed favours"
          href="/agents/algorithm"
        />
        <SettingsRow icon="leaf" label="Sustainability" href="/settings/sustainability" />
      </SettingsSection>

      <SettingsSection title="Connected services">
        <SettingsRow
          icon="sparkles"
          label="AI agents"
          subtitle="Automated helpers for your closet"
          href="/agents"
        />
      </SettingsSection>

      <SettingsSection title="Help & legal">
        <SettingsRow icon="help" label="Help centre" href="/help" />
        <SettingsRow
          icon="chat"
          label="Support centre"
          subtitle="Cases and resolution centre"
          href="/support"
        />
        <SettingsRow icon="flag" label="Report a problem" onClick={() => setSheet('report')} />
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

      <ConfirmSheet
        sheet={
          signOutConfirm
            ? {
                title: 'Sign out of ThryftVerse?',
                message:
                  'Your bag, closet and messages stay on your account — you\u2019ll need your email and password to sign back in.',
                confirmLabel: 'Sign out',
                variant: 'destructive',
                onConfirm: () => {
                  setSignOutConfirm(false);
                  handleSignOut();
                },
              }
            : null
        }
        onDismiss={() => setSignOutConfirm(false)}
      />

      <LanguageSheet open={sheet === 'language'} onClose={closeSheet} />
      <VerificationSheet open={sheet === 'verification'} onClose={closeSheet} />
      <ReportSheet open={sheet === 'report'} onClose={closeSheet} />
      <AgeConfirmationSheet open={sheet === 'age'} onClose={closeSheet} />
      <PickerSheet
        open={sheet === 'accent'}
        onClose={closeSheet}
        title="Accent colour"
        options={ACCENT_PRESETS.map((p) => ({
          value: p.id,
          label: p.label,
          swatch: (theme === 'light' ? p.light : p.dark).brand,
        }))}
        selectedValue={accent}
        onSelect={(v) => setAccent(v as (typeof ACCENT_PRESETS)[number]['id'])}
        note="Applies across this device — buttons, links and highlights take the tone."
      />
      <PickerSheet
        open={sheet === 'density'}
        onClose={closeSheet}
        title="Density"
        options={DENSITY_OPTIONS.map((d) => ({
          value: d.value,
          label: d.label,
          subtitle: d.subtitle,
        }))}
        selectedValue={density}
        onSelect={(v) => setDensity(v as Density)}
        note="Stored on this device and applied wherever layouts support density switching."
      />
    </>
  );
}
