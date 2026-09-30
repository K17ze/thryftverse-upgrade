'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as usersService from '@/lib/api/services/users';

const isLive = DATA_MODE === 'live';

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

export function DataExportSection() {
  const { user, isGuest } = useSession();
  const { show } = useToast();
  const [exporting, setExporting] = useState(false);

  const downloadExport = async () => {
    if (isLive) {
      if (isGuest) {
        show('Sign in to download your account data', 'info');
        return;
      }
      setExporting(true);
      try {
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

  return (
    <>
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
    </>
  );
}
