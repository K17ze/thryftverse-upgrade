'use client';

/**
 * DataView — the /settings/data surface.
 *
 * Web deepening of the mobile DataPrivacyScreen + DataExportScreen +
 * DeleteAccountScreen:
 * - Consent toggles (ads, analytics, recommendations, partner sharing),
 *   persisted to the settings-prefs store.
 * - "Download your data" produces a real export — a JSON document of the
 *   session's persisted stores, downloaded via a blob URL. What you get
 *   is exactly what this device holds; a production build additionally
 *   bundles server-side records (orders, messages, listings).
 * - Delete account: typed-confirmation flow that clears every persisted
 *   ThryftVerse key on this device, signs out, and lands on /auth with
 *   honest copy about what was (and wasn't) deleted.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { Switch } from './Switch';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs, type DataFlag } from '@/lib/store/settingsPrefs';

// ── Consent toggles ─────────────────────────────────────────────────────────

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
    key: 'recommendations',
    label: 'Recommendation personalisation',
    sub: 'Use your activity to shape your feed and suggestions',
  },
  {
    key: 'thirdPartySharing',
    label: 'Partner data sharing',
    sub: 'Anonymised aggregate data shared with partners',
  },
];

// ── Export ──────────────────────────────────────────────────────────────────

const EXPORT_CATEGORIES = [
  { label: 'Profile & preferences', sub: 'Session identity, settings and privacy choices' },
  { label: 'Activity', sub: 'Wishlist, saved items, follows, bags and read cursors' },
  { label: 'Creations', sub: 'Outfits, moodboards, saved searches and listing overlays' },
];

function buildExport(user: unknown) {
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

function downloadExport(user: unknown) {
  const payload = buildExport(user);
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

function DeleteAccountRow() {
  const router = useRouter();
  const { signOut } = useSession();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const confirmDelete = () => {
    clearPersistedStores();
    setOpen(false);
    setTyped('');
    signOut();
    show('Account deleted — your local data was cleared', 'info');
    router.push('/auth');
  };

  return (
    <>
      <SettingsRow
        icon="trash"
        label="Delete account"
        danger
        onClick={() => setOpen(true)}
      />

      <Sheet open={open} onClose={() => setOpen(false)} title="Delete account" maxWidth={440}>
        <div className="px-5 py-5">
          <div className="space-y-3 text-body text-text-secondary">
            <p>
              Deleting your account removes your profile, listings, orders,
              messages and saved items — permanently.
            </p>
            <p>
              In this preview the account is demo data: this step clears every
              ThryftVerse preference and store held on this device and signs
              you out. Production deletion also erases server-side records.
            </p>
          </div>

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

          <Button
            variant="danger"
            size="md"
            fullWidth
            className="mt-4"
            disabled={typed.trim().toUpperCase() !== DELETE_PHRASE}
            onClick={confirmDelete}
          >
            Delete my account permanently
          </Button>
          <Button
            variant="quiet"
            size="md"
            fullWidth
            className="mt-2"
            onClick={() => {
              setOpen(false);
              setTyped('');
            }}
          >
            Keep my account
          </Button>
        </div>
      </Sheet>
    </>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

export function DataView() {
  const hydrated = useHydrated();
  const { user } = useSession();
  const { show } = useToast();
  const personalisedAds = useSettingsPrefs((s) => s.personalisedAds);
  const analytics = useSettingsPrefs((s) => s.analytics);
  const recommendations = useSettingsPrefs((s) => s.recommendations);
  const thirdPartySharing = useSettingsPrefs((s) => s.thirdPartySharing);
  const setDataFlag = useSettingsPrefs((s) => s.setDataFlag);

  const flagValues: Record<DataFlag, boolean> = {
    personalisedAds,
    analytics,
    recommendations,
    thirdPartySharing,
  };

  return (
    <>
      <SettingsSection title="Privacy controls">
        {hydrated ? (
          DATA_SWITCHES.map((row) => (
            <div key={row.key} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-body-emphasis text-text-primary">{row.label}</p>
                <p className="clamp-1 text-caption text-text-muted">{row.sub}</p>
              </div>
              <Switch
                checked={flagValues[row.key]}
                onChange={(v) => setDataFlag(row.key, v)}
                aria-label={row.label}
              />
            </div>
          ))
        ) : (
          <div aria-busy aria-label="Loading privacy controls">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[52px] w-full rounded-none" />
            ))}
          </div>
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
            onClick={() => {
              downloadExport(user);
              show('Export downloaded as JSON', 'success');
            }}
          >
            Download your data
          </Button>
          <p className="mt-3 text-caption text-text-muted">
            The file contains everything this session has persisted on this
            device — readable, portable, generated instantly.
          </p>
        </div>
      </SettingsSection>

      <div className="mt-8 border-y border-border-subtle">
        <DeleteAccountRow />
      </div>

      <p className="px-4 pt-5 text-caption text-text-muted sm:px-5">
        Consent choices in this preview are stored on this device. The platform
        records them against your account so they apply on every device.
      </p>
    </>
  );
}
