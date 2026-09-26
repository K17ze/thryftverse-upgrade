'use client';

/**
 * /co-own/alerts — manage price alerts across Co-Own markets.
 * Port of the mobile CoOwnPriceAlertsScreen: flat list grouped
 * Active / Paused, one dominant action per row (the switch), one
 * destructive action behind a confirm sheet.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { useCoOwnAssets } from '@/lib/hooks/coown-queries';
import { useHydrated } from '@/lib/store/useStore';
import type { StoredPriceAlert } from '@/lib/contracts/coown';
import { formatDate } from '@/lib/utils/format';
import { PRICE_ALERT_SEED } from '@/lib/data/fixtures-coown';
import { useCoOwnAlerts } from './alertStore';
import { gbp } from './format';

function AlertSwitch({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`pressable relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
        checked ? 'border-brand bg-brand-subtle' : 'border-border bg-surface-alt'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-all ${
          checked ? 'left-[24px] bg-brand' : 'left-1 bg-text-muted'
        }`}
      />
    </button>
  );
}

function AlertRow({
  alert,
  title,
  paused,
  onToggle,
  onDelete,
}: {
  alert: StoredPriceAlert;
  title: string;
  paused: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isAbove = alert.direction === 'above';
  return (
    <li className={`flex items-center gap-3 py-3.5 ${paused ? 'opacity-60' : ''}`}>
      <Link
        href={`/co-own/${alert.assetId}`}
        className="pressable flex min-w-0 flex-1 items-center gap-3"
        aria-label={`View ${title}`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            paused
              ? 'bg-surface-alt text-text-muted'
              : isAbove
                ? 'bg-coown-up-subtle text-coown-up'
                : 'bg-coown-down-subtle text-coown-down'
          }`}
        >
          <Icon name={isAbove ? 'arrowUp' : 'chevronDown'} size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body text-text-secondary">
            <span className="clamp-1 font-semibold text-text-primary">{title}</span>
            <span className="text-text-muted"> · </span>
            <span className="tnum">{isAbove ? 'Above' : 'Below'} {gbp(alert.targetPriceGbp)}</span>
          </span>
          <span className="mt-0.5 block text-meta text-text-muted">
            {paused ? 'Paused · ' : ''}Alerts when the last-trade price{' '}
            {isAbove ? 'rises above' : 'drops below'} {gbp(alert.targetPriceGbp)} · set{' '}
            {formatDate(alert.createdAt)}
          </span>
        </span>
      </Link>
      <AlertSwitch
        checked={alert.active}
        label={alert.active ? 'Pause alert' : 'Enable alert'}
        onToggle={onToggle}
      />
      <button
        type="button"
        aria-label="Delete alert"
        onClick={onDelete}
        className="pressable inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-danger-text hover:bg-danger-subtle"
      >
        <Icon name="trash" size={18} />
      </button>
    </li>
  );
}

export function PriceAlertsView() {
  const router = useRouter();
  const assetsQ = useCoOwnAssets();
  const hydrated = useHydrated();
  // SSR + the first client render agree on the seed; persisted truth
  // takes over after mount (persisted reads differ for returning sessions).
  const stored = useCoOwnAlerts((s) => s.alerts);
  const alerts = hydrated ? stored : PRICE_ALERT_SEED;
  const toggleAlert = useCoOwnAlerts((s) => s.toggleAlert);
  const removeAlert = useCoOwnAlerts((s) => s.removeAlert);
  const { show } = useToast();
  const [pendingDelete, setPendingDelete] = useState<StoredPriceAlert | null>(null);

  const titleFor = (assetId: string) =>
    assetsQ.data?.find((a) => a.id === assetId)?.title ?? 'Unknown market';

  const active = alerts.filter((a) => a.active);
  const paused = alerts.filter((a) => !a.active);

  if (assetsQ.isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
        <div className="skeleton h-8 w-44 rounded-sm" aria-hidden="true" />
        <div className="mt-8 space-y-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-14 rounded-sm" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-editorial-display text-text-primary">Price alerts</h1>
          <p className="mt-2 text-meta text-text-secondary">
            {alerts.length === 0
              ? 'Alerts you set on a market live here'
              : `${alerts.length} ${alerts.length === 1 ? 'alert' : 'alerts'} across Co-Own markets`}
          </p>
        </div>
        <nav aria-label="Co-Own" className="flex items-center gap-5">
          <Link
            href="/co-own"
            className="text-body font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            Markets
          </Link>
        </nav>
      </header>

      {alerts.length === 0 ? (
        <div className="mt-8 border-t border-border-subtle">
          <EmptyState
            icon="notifications"
            title="No price alerts yet"
            subtitle="Set an alert from any market's page — the bell beside the price. Alerts you create live here."
            actionLabel="Browse markets"
            onAction={() => router.push('/co-own')}
          />
        </div>
      ) : (
        <>
          <p className="mt-6 flex items-start gap-2 border-b border-border-subtle pb-5 text-meta text-text-secondary">
            <Icon name="info" size={14} className="mt-0.5 shrink-0 text-text-muted" />
            Alerts are saved on this device. Delivery isn&rsquo;t live yet — check
            back on a market to see if your target has been crossed.
          </p>

          {active.length > 0 ? (
            <section aria-labelledby="alerts-active">
              <h2
                id="alerts-active"
                className="mt-8 text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
              >
                Active
              </h2>
              <ul className="divide-y divide-border-subtle">
                {active.map((a) => (
                  <AlertRow
                    key={a.id}
                    alert={a}
                    title={titleFor(a.assetId)}
                    paused={false}
                    onToggle={() => {
                      toggleAlert(a.id);
                      show('Alert paused', 'info');
                    }}
                    onDelete={() => setPendingDelete(a)}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {paused.length > 0 ? (
            <section aria-labelledby="alerts-paused">
              <h2
                id="alerts-paused"
                className="mt-8 text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
              >
                Paused
              </h2>
              <ul className="divide-y divide-border-subtle">
                {paused.map((a) => (
                  <AlertRow
                    key={a.id}
                    alert={a}
                    title={titleFor(a.assetId)}
                    paused
                    onToggle={() => {
                      toggleAlert(a.id);
                      show('Alert enabled', 'info');
                    }}
                    onDelete={() => setPendingDelete(a)}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <Sheet
        open={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        title="Delete alert?"
        maxWidth={420}
      >
        <div className="p-5">
          <p className="text-body text-text-secondary">
            {pendingDelete
              ? `Remove the ${pendingDelete.direction} ${gbp(pendingDelete.targetPriceGbp)} alert on ${titleFor(pendingDelete.assetId)}?`
              : ''}
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={() => {
                if (pendingDelete) {
                  removeAlert(pendingDelete.id);
                  show('Alert deleted', 'success');
                }
                setPendingDelete(null);
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
