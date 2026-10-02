'use client';

/**
 * /co-own/alerts — manage price alerts across Co-Own markets.
 * Port of the mobile CoOwnPriceAlertsScreen: flat list grouped
 * Active / Paused, one dominant action per row (the switch), one
 * destructive action behind a confirm sheet.
 */

import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { AlertRow, AlertsTableHead } from './alerts/AlertRow';
import { DeleteAlertSheet } from './alerts/DeleteAlertSheet';
import { usePriceAlertsWorkflow } from './alerts/usePriceAlertsWorkflow';

export function PriceAlertsView() {
  const {
    router,
    assetsQ,
    alerts,
    ready,
    alertsError,
    refetchAlerts,
    source,
    requiresAuth,
    requireAuth,
    wall,
    pendingDelete,
    setPendingDelete,
    deleting,
    titleFor,
    active,
    fired,
    paused,
    onToggleAlert,
    handleConfirmDelete,
  } = usePriceAlertsWorkflow();

  // `ready` only advances on a resolved read — a failed alerts query
  // must fall through to the error branch, not skeleton forever.
  if (assetsQ.isLoading || (!ready && !alertsError)) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-[1100px]">
        <div className="skeleton h-8 w-44 rounded-sm" aria-hidden="true" />
        <div className="mt-8 space-y-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-14 rounded-sm" />
          ))}
        </div>
      </div>
    );
  }

  // Without the market snapshot alert rows would read "Unknown market" —
  // surface the failure with retry instead of degrading silently. Same
  // for a failed alerts read: retry whichever source errored.
  if (assetsQ.isError || !assetsQ.data || alertsError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-[1100px]">
        <h1 className="text-editorial-display text-text-primary">Price alerts</h1>
        <EmptyState
          icon="notifications"
          title="Couldn't load your alerts"
          subtitle="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            void assetsQ.refetch();
            refetchAlerts();
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-[1100px]">
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

      {requiresAuth ? (
        <div className="mt-8 border-t border-border-subtle">
          <EmptyState
            icon="notifications"
            title="Sign in for alerts"
            subtitle="Price alerts are saved to your account and fire server-side — sign in to set and manage them."
            actionLabel="Sign in"
            onAction={() => requireAuth('purchase')}
          />
        </div>
      ) : alerts.length === 0 ? (
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
            <Icon
              name="info"
              size={14}
              className="mt-0.5 shrink-0 text-text-muted"
            />
            {source === 'server'
              ? 'Alerts evaluate server-side against live last-trade prices — a fired alert notifies you and lands under Triggered below.'
              : 'Alerts evaluate against last-trade prices on this device while you browse. There\u2019s no push delivery — fired alerts land under Triggered below.'}
          </p>

          {active.length > 0 ? (
            <section aria-labelledby="alerts-active">
              <h2
                id="alerts-active"
                className="mt-8 text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
              >
                Active
              </h2>
              <AlertsTableHead />
              <ul className="divide-y divide-border-subtle lg:border-b lg:border-border-subtle">
                {active.map((a) => (
                  <AlertRow
                    key={a.id}
                    alert={a}
                    title={titleFor(a.assetId)}
                    paused={false}
                    fired={false}
                    onToggle={() => onToggleAlert(a)}
                    onDelete={() => setPendingDelete(a)}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {fired.length > 0 ? (
            <section aria-labelledby="alerts-fired">
              <h2
                id="alerts-fired"
                className="mt-8 text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
              >
                Triggered
              </h2>
              <AlertsTableHead />
              <ul className="divide-y divide-border-subtle lg:border-b lg:border-border-subtle">
                {fired.map((a) => (
                  <AlertRow
                    key={a.id}
                    alert={a}
                    title={titleFor(a.assetId)}
                    paused={false}
                    fired
                    onToggle={() => onToggleAlert(a)}
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
              <AlertsTableHead />
              <ul className="divide-y divide-border-subtle lg:border-b lg:border-border-subtle">
                {paused.map((a) => (
                  <AlertRow
                    key={a.id}
                    alert={a}
                    title={titleFor(a.assetId)}
                    paused
                    fired={false}
                    onToggle={() => onToggleAlert(a)}
                    onDelete={() => setPendingDelete(a)}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <DeleteAlertSheet
        pendingDelete={pendingDelete}
        title={pendingDelete ? titleFor(pendingDelete.assetId) : ''}
        deleting={deleting}
        onConfirm={handleConfirmDelete}
        onClose={() => setPendingDelete(null)}
      />
      {wall}
    </div>
  );
}
