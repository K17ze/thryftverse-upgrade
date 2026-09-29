'use client';

/**
 * DataView — the /settings/data surface.
 *
 * Web deepening of the mobile DataPrivacyScreen + DataExportScreen +
 * DeleteAccountScreen:
 * - Consent toggles (ads, analytics, partner sharing). Live mode hydrates
 *   from GET /users/me/consent and writes every toggle through PATCH
 *   /users/me/consent (the route rewrites the whole row, so each call
 *   carries the full projection); the local store is the optimistic
 *   mirror — a failed write reverts the toggled flag. Fixture/guest
 *   sessions keep the device-local path.
 * - "Download your data": live mode calls GET /users/me/export — the
 *   synchronous GDPR snapshot assembled server-side — and downloads what
 *   it returns. Fixture mode downloads this device's persisted stores.
 * - Delete account: live mode re-authenticates in the confirm sheet
 *   (password, plus a TOTP code when two-factor is enrolled) and issues
 *   DELETE /users/me — real erasure, surfaced verbatim on failure; local
 *   stores clear only after the 200. Fixture mode clears this device's
 *   preview data and signs out.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { Switch } from './Switch';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { AuthField } from '@/components/auth/AuthField';
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

const isLive = DATA_MODE === 'live';

// ── Consent toggles ─────────────────────────────────────────────────────────

// 'recommendations' is intentionally not surfaced: its copy claimed a
// present-tense effect on feed ranking that no web surface consumes.
// The store flag stays for the feed workstream to wire honestly.

const DATA_SWITCHES: { key: DataFlag; label: string; sub: string }[] = [
  {
    key: 'personalisedAds',
    label: 'Personalised ads',
    sub: 'Use your activity to tailor partner offers',
  },
  {
    key: 'analytics',
    label: 'Analytics',
    sub: 'Anonymous usage data that helps improve ThryftVerse',
  },
  {
    key: 'thirdPartySharing',
    label: 'Partner data sharing',
    sub: 'Anonymised aggregate data shared with partners',
  },
];

// ── Export ──────────────────────────────────────────────────────────────────

/** What the export covers — the rows differ per backend because the two
 *  exports genuinely contain different data. */
const EXPORT_CATEGORIES = isLive
  ? [
      { label: 'Profile & account', sub: 'Identity, addresses, sessions and security records' },
      { label: 'Marketplace', sub: 'Orders, listings, reviews, bids, saved items and follows' },
      { label: 'Money & compliance', sub: 'Wallet ledger, payouts, verification and consent records' },
    ]
  : [
      { label: 'Profile & preferences', sub: 'Session identity, settings and privacy choices' },
      { label: 'Activity', sub: 'Wishlist, saved items, follows, bags and read cursors' },
      { label: 'Creations', sub: 'Outfits, moodboards, saved searches and listing overlays' },
    ];

/** Fixture export — the device's persisted `thryftverse.*` stores,
 *  verbatim. Not a stand-in for account data; it is exactly what this
 *  device holds. */
function buildLocalExport(user: unknown) {
  const stores: Record<string, unknown> = {};
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith('thryftverse.')) continue;
    const raw = window.localStorage.getItem(key);
    try {
      stores[key] = raw ? JSON.parse(raw) : null;
    } catch {
      stores[key] = raw;
    }
  }
  return {
    app: 'ThryftVerse web',
    exportVersion: 1,
    generatedAt: new Date().toISOString(),
    account: user,
    persistedStores: stores,
  };
}

function downloadJson(payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `thryftverse-data-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Delete account ──────────────────────────────────────────────────────────

const DELETE_PHRASE = 'DELETE';

function clearPersistedStores() {
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key?.startsWith('thryftverse.')) keys.push(key);
  }
  for (const key of keys) window.localStorage.removeItem(key);
}

export function DeleteAccountRow() {
  const router = useRouter();
  const { signOut, isGuest, accountIdentity } = useSession();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Server told us a code is required even though the session snapshot
   *  didn't mark 2FA — keep the field visible once asked. */
  const [totpRequested, setTotpRequested] = useState(false);

  const requiresTotp = accountIdentity?.twoFactorEnabled === true || totpRequested;
  const phraseOk = typed.trim().toUpperCase() === DELETE_PHRASE;
  const ready = phraseOk && (!isLive || !requiresTotp || totpCode.trim().length >= 6);

  const resetSheet = () => {
    setTyped('');
    setPassword('');
    setTotpCode('');
    setError(null);
    setTotpRequested(false);
    setSubmitting(false);
  };

  const confirmDelete = async () => {
    if (!isLive) {
      // Fixture: there is no server account — the honest action is
      // clearing this device's preview data and signing out.
      clearPersistedStores();
      setOpen(false);
      resetSheet();
      signOut();
      show('Local preview data cleared — signed out', 'info');
      router.push('/auth');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // DELETE /users/me — the backend re-verifies identity (password or
      // OAuth proof, plus TOTP when enrolled) before GDPR erasure. Local
      // stores clear only after the server confirms.
      await usersService.deleteMyAccount({
        confirmPhrase: DELETE_PHRASE,
        password: password || undefined,
        totpCode: totpCode.trim() || undefined,
      });
      clearPersistedStores();
      setOpen(false);
      resetSheet();
      signOut();
      show('Account deleted', 'info');
      router.push('/auth');
    } catch (e) {
      const parsed = parseApiError(e);
      // Surface the server's refusal verbatim — 'Password verification
      // failed', TOTP required/invalid, OAUTH_REAUTH_REQUIRED, or the
      // unresolved-orders/payouts block.
      setError(parsed.message || 'Could not delete the account');
      if (parsed.message?.toLowerCase().includes('two-factor')) setTotpRequested(true);
      setSubmitting(false);
    }
  };

  return (
    <>
      <SettingsRow
        icon="trash"
        label="Delete account"
        danger
        onClick={() => setOpen(true)}
      />

      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          resetSheet();
        }}
        title="Delete account"
        maxWidth={440}
      >
        <div className="px-5 py-5">
          {isLive && isGuest ? (
            <>
              <p className="text-body text-text-secondary">
                Account deletion belongs to a signed-in account — sign in
                to continue.
              </p>
              <Button
                variant="primary"
                size="md"
                fullWidth
                className="mt-4"
                onClick={() => {
                  setOpen(false);
                  router.push('/auth/login');
                }}
              >
                Sign in
              </Button>
              <Button
                variant="quiet"
                size="md"
                fullWidth
                className="mt-2"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-3 text-body text-text-secondary">
                {isLive ? (
                  <p>
                    Deleting your account removes your profile, listings,
                    orders, messages and saved items — permanently. The
                    platform anonymises your personal data and every session
                    is signed out. This can’t be undone.
                  </p>
                ) : (
                  <p>
                    In this preview the account is demo data — deleting it
                    removes this device’s local preview data (every
                    ThryftVerse preference and store held here) and signs
                    you out. Nothing is erased on a server.
                  </p>
                )}
              </div>

              {isLive ? (
                <div className="mt-5 space-y-4">
                  <AuthField
                    label="Password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {requiresTotp ? (
                    <AuthField
                      label="Two-factor code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                    />
                  ) : null}
                </div>
              ) : null}

              <label
                htmlFor="delete-confirm"
                className="mt-5 block text-caption font-medium text-text-secondary"
              >
                Type {DELETE_PHRASE} to confirm
              </label>
              <input
                id="delete-confirm"
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={DELETE_PHRASE}
                autoComplete="off"
                className="mt-2 h-11 w-full rounded-md border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted focus:border-text-muted focus:outline-none"
              />

              {error ? (
                <p role="alert" className="mt-3 text-caption text-danger-text">
                  {error}
                </p>
              ) : null}

              <Button
                variant="danger"
                size="md"
                fullWidth
                className="mt-4"
                disabled={!ready || submitting}
                onClick={() => void confirmDelete()}
              >
                {submitting
                  ? 'Deleting…'
                  : isLive
                    ? 'Verify and delete my account'
                    : 'Delete my account permanently'}
              </Button>
              <Button
                variant="quiet"
                size="md"
                fullWidth
                className="mt-2"
                disabled={submitting}
                onClick={() => {
                  setOpen(false);
                  resetSheet();
                }}
              >
                Keep my account
              </Button>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

export function DataView() {
  const hydrated = useHydrated();
  const { user, isGuest, sessionLoading } = useSession();
  const { show } = useToast();
  const personalisedAds = useSettingsPrefs((s) => s.personalisedAds);
  const analytics = useSettingsPrefs((s) => s.analytics);
  const recommendations = useSettingsPrefs((s) => s.recommendations);
  const thirdPartySharing = useSettingsPrefs((s) => s.thirdPartySharing);
  const setDataFlag = useSettingsPrefs((s) => s.setDataFlag);
  const syncDataConsent = useSettingsPrefs((s) => s.syncDataConsent);
  const [exporting, setExporting] = useState(false);

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

  /** Optimistic toggle → PATCH the full wire projection (the route
   *  rewrites every column, so a partial body would clobber the rest);
   *  a failed write restores just the toggled key. */
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

  const downloadExport = async () => {
    if (isLive) {
      if (isGuest) {
        show('Sign in to download your account data', 'info');
        return;
      }
      setExporting(true);
      try {
        // GET /users/me/export — the synchronous GDPR snapshot; download
        // exactly what the server assembled.
        const result = await usersService.fetchMyDataExport();
        downloadJson(result.export);
        show('Export downloaded as JSON', 'success');
      } catch (e) {
        show(parseApiError(e).message || 'Could not generate the export', 'error');
      } finally {
        setExporting(false);
      }
      return;
    }
    downloadJson(buildLocalExport(user));
    show('Export downloaded as JSON', 'success');
  };

  const loading = !hydrated || (isLive && sessionLoading) || (syncs && liveConsent.isLoading);

  return (
    <>
      <SettingsSection title="Privacy controls">
        {loading ? (
          <div aria-busy aria-label="Loading privacy controls">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[52px] w-full rounded-none" />
            ))}
          </div>
        ) : (
          <>
            {syncs && liveConsent.isError ? (
              <div className="px-4 py-3.5 sm:px-5">
                <p className="text-caption text-text-muted">
                  Couldn’t reach the server — showing this device’s saved choices.
                </p>
                <button
                  type="button"
                  onClick={() => void liveConsent.refetch()}
                  className="pressable mt-1 inline-flex min-h-11 items-center text-caption font-semibold text-text-primary"
                >
                  Try again
                </button>
              </div>
            ) : null}
            {DATA_SWITCHES.map((row) => (
              <div key={row.key} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="text-body-emphasis text-text-primary">{row.label}</p>
                  <p className="clamp-1 text-caption text-text-muted">{row.sub}</p>
                </div>
                <Switch
                  checked={flagValues[row.key]}
                  onChange={(v) => syncFlag(row.key, v)}
                  aria-label={row.label}
                />
              </div>
            ))}
          </>
        )}
      </SettingsSection>

      <SettingsSection title="Your data">
        <ul className="divide-y divide-border-subtle">
          {EXPORT_CATEGORIES.map((c) => (
            <li key={c.label} className="px-4 py-3 sm:px-5">
              <p className="text-body-emphasis text-text-primary">{c.label}</p>
              <p className="text-caption text-text-muted">{c.sub}</p>
            </li>
          ))}
        </ul>
        <div className="px-4 py-4 sm:px-5">
          <Button
            variant="secondary"
            size="md"
            icon="download"
            fullWidth
            disabled={exporting}
            onClick={() => void downloadExport()}
          >
            {exporting ? 'Preparing export…' : 'Download your data'}
          </Button>
          <p className="mt-3 text-caption text-text-muted">
            {isLive
              ? 'The file contains everything the platform holds on your account — assembled server-side, downloaded as JSON.'
              : 'The file contains everything this preview has persisted on this device — readable, portable, generated instantly.'}
          </p>
        </div>
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
