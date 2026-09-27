'use client';

/**
 * /seller-hub/settings — shop controls the seller actually owns.
 *
 * Holiday mode follows the mobile PrivacySettings grammar: a labelled
 * switch, an optional return date (future-dated), an optional away
 * message, and the honest "what buyers see" line. Live mode reads/writes
 * the real /users/me/preferences contract; fixture mode persists the same
 * state on this device and projects it onto the fixture closet so demo
 * buy buttons genuinely pause — the flag is never a dead toggle.
 *
 * Seller standards render the real program metrics in live mode; demo
 * mode shows only what the fixture queue can truthfully compute
 * (ship time, shipped count) and marks the rest as not measured.
 */

import { useEffect, useState } from 'react';
import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/settings/Switch';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import { formatDate } from '@/lib/utils/format';
import {
  useFulfilmentCounts,
  useSellerStandards,
  useShopAway,
  useUpdateShopAway,
} from '@/lib/hooks/seller-queries';

const INPUT_CLASS =
  'h-11 w-full rounded-md border border-border bg-input px-3.5 text-body text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none';

/** The smallest valid return date — the backend rejects past dates too. */
function tomorrowInputValue(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : '';
}

const TIER_COPY: Record<string, { label: string; variant: 'success' | 'warning' | 'neutral' }> = {
  top_performer: { label: 'Top performer', variant: 'success' },
  performer: { label: 'Performer', variant: 'success' },
  standard: { label: 'Standard', variant: 'neutral' },
};

function SettingsSkeleton() {
  return (
    <div aria-busy aria-label="Loading shop settings" className="mt-8 space-y-4">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export default function SellerSettingsPage() {
  const counts = useFulfilmentCounts();
  const { show } = useToast();
  const away = useShopAway();
  const updateAway = useUpdateShopAway();
  const standards = useSellerStandards();

  // Local form state — hydrated once the away query resolves. The switch
  // writes immediately (mobile parity); date/message commit on change/blur.
  const [untilInput, setUntilInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!away.data || hydratedFor === 'yes') return;
    setUntilInput(toDateInputValue(away.data.holidayModeUntil));
    setMessageInput(away.data.awayMessage ?? '');
    setHydratedFor('yes');
  }, [away.data, hydratedFor]);

  const onToggle = (next: boolean) => {
    updateAway.mutate(
      next
        ? {
            holidayMode: true,
            holidayModeUntil: away.data?.holidayModeUntil ?? null,
            awayMessage: away.data?.awayMessage ?? null,
          }
        : // Turning off always clears the stored return date and note —
          // a stale "until" can never resurrect an away state later.
          { holidayMode: false, holidayModeUntil: null, awayMessage: null },
      {
        onSuccess: () =>
          show(
            next
              ? 'Holiday mode on — your shop is paused for buyers'
              : 'Holiday mode off — your listings are visible again',
            'success',
          ),
        onError: () =>
          show('Could not update holiday mode — try again', 'error'),
      },
    );
  };

  const commitReturnDate = (value: string) => {
    setUntilInput(value);
    if (!value) {
      updateAway.mutate({
        holidayMode: true,
        holidayModeUntil: null,
        awayMessage: away.data?.awayMessage ?? null,
      });
      return;
    }
    const parsed = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed) || parsed <= Date.now()) {
      show('Return date has to be in the future', 'error');
      return;
    }
    updateAway.mutate(
      {
        holidayMode: true,
        holidayModeUntil: new Date(parsed).toISOString(),
        awayMessage: away.data?.awayMessage ?? null,
      },
      { onError: () => show('Could not save the return date', 'error') },
    );
  };

  const commitMessage = () => {
    const message = messageInput.trim();
    const current = away.data?.awayMessage ?? '';
    if (message === current) return;
    updateAway.mutate(
      {
        holidayMode: true,
        holidayModeUntil: away.data?.holidayModeUntil ?? null,
        awayMessage: message || null,
      },
      { onError: () => show('Could not save the away message', 'error') },
    );
  };

  const holidayMode = away.data?.holidayMode === true;
  const busy = updateAway.isPending;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12">
      <h1 className="text-screen-title font-semibold text-text-primary">Shop settings</h1>
      <SellerSectionNav toPost={counts.toPost} posted={counts.posted} />

      {away.isLoading ? (
        <SettingsSkeleton />
      ) : away.isError ? (
        <div className="mt-8">
          <EmptyState
            icon="alert"
            title="Couldn't load shop settings"
            subtitle="We couldn't reach your preferences. Try again in a moment."
            actionLabel="Retry"
            onAction={() => void away.refetch()}
          />
        </div>
      ) : (
        <>
          {/* ── Holiday mode — mobile PrivacySettings grammar ── */}
          <section aria-label="Holiday mode" className="mt-8">
            <h2 className="text-section-title font-semibold text-text-primary">Shop activity</h2>
            <div className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
              <div className="flex items-center gap-3 py-3.5">
                <Icon name="bag" size={20} className="shrink-0 text-text-secondary" />
                <div className="min-w-0 flex-1">
                  <p className="text-body-emphasis font-medium text-text-primary">Holiday mode</p>
                  <p className="mt-0.5 text-meta text-text-muted">
                    Pause your listings and hide your shop while you&apos;re away
                  </p>
                </div>
                <Switch
                  checked={holidayMode}
                  onChange={onToggle}
                  disabled={busy}
                  aria-label="Holiday mode — pause your shop for buyers"
                />
              </div>

              {holidayMode ? (
                <>
                  <div className="flex items-center gap-3 py-3.5">
                    <Icon name="clock" size={20} className="shrink-0 text-text-secondary" />
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor="away-return-date"
                        className="block text-body-emphasis font-medium text-text-primary"
                      >
                        Return date
                      </label>
                      <p className="mt-0.5 text-meta text-text-muted">
                        {away.data?.holidayModeUntil
                          ? `Buyers see "back ${formatDate(away.data.holidayModeUntil)}" — your shop stays paused until then`
                          : 'Optional — buyers see your shop as paused until you return'}
                      </p>
                    </div>
                    <input
                      id="away-return-date"
                      type="date"
                      value={untilInput}
                      min={tomorrowInputValue()}
                      disabled={busy}
                      onChange={(e) => commitReturnDate(e.target.value)}
                      className={`${INPUT_CLASS} w-40`}
                    />
                  </div>

                  <div className="flex items-start gap-3 py-3.5">
                    <Icon name="chat" size={20} className="mt-2.5 shrink-0 text-text-secondary" />
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor="away-message"
                        className="block text-body-emphasis font-medium text-text-primary"
                      >
                        Away message
                      </label>
                      <p className="mt-0.5 text-meta text-text-muted">
                        Optional — shown on your shop while you&apos;re away
                      </p>
                      <textarea
                        id="away-message"
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onBlur={commitMessage}
                        rows={2}
                        maxLength={160}
                        disabled={busy}
                        placeholder="e.g. Away until Monday — orders ship when I'm back"
                        className="mt-2 w-full resize-y rounded-md border border-border bg-input px-3.5 py-2.5 text-body text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none"
                      />
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <p className="mt-2.5 flex items-start gap-1.5 text-meta text-text-muted">
              <Icon name="info" size={14} className="mt-px shrink-0" />
              {DATA_MODE === 'live'
                ? 'Saved to your account — buyers see the pause immediately.'
                : 'Demo mode — saved on this device; fixture listings pause for buyers in this session.'}
            </p>
            {updateAway.isError ? (
              <p role="alert" className="mt-2 text-caption text-danger-text">
                We couldn&apos;t save that change — it wasn&apos;t applied. Try again.
              </p>
            ) : null}
          </section>

          {/* ── Seller standards — real program metrics where they exist ── */}
          <section aria-label="Seller standards" className="mt-10">
            <h2 className="text-section-title font-semibold text-text-primary">Seller standards</h2>
            {standards.isLoading ? (
              <div className="mt-3 space-y-2" aria-busy aria-label="Loading seller standards">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
            ) : standards.isError ? (
              <p className="mt-3 text-body text-text-muted">
                Standards couldn&apos;t be loaded —{' '}
                <button
                  type="button"
                  onClick={() => void standards.refetch()}
                  className="pressable font-medium text-text-primary underline-offset-4 hover:underline"
                >
                  try again
                </button>
                .
              </p>
            ) : standards.data?.kind === 'live' ? (
              <LiveStandards standards={standards.data.standards} />
            ) : standards.data?.kind === 'demo' ? (
              <DemoStandards standards={standards.data.standards} />
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

/** Live program metrics — the /sellers/:id/standards projection verbatim. */
function LiveStandards({
  standards,
}: {
  standards: {
    metrics: {
      ordersShipped: number;
      salesVolume: number;
      averageShipTimeDays: number;
      cancellationRate: number;
      returnCaseRate: number;
    } | null;
    tier: string;
    defects: { metric: string; threshold: number; actual: number; gap: number }[];
    appealsAvailable: boolean;
  };
}) {
  const tier = TIER_COPY[standards.tier] ?? TIER_COPY.standard;
  const m = standards.metrics;
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <Badge variant={tier.variant}>{tier.label}</Badge>
        {standards.appealsAvailable ? (
          <span className="text-meta text-text-muted">Appeals available</span>
        ) : null}
      </div>
      {m ? (
        <dl className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
          {(
            [
              ['Orders shipped', m.ordersShipped.toLocaleString('en-GB')],
              ['Sales volume', `£${m.salesVolume.toLocaleString('en-GB')}`],
              ['Average ship time', `${m.averageShipTimeDays.toFixed(1)} days`],
              ['Cancellation rate', `${(m.cancellationRate * 100).toFixed(1)}%`],
              ['Return-case rate', `${(m.returnCaseRate * 100).toFixed(1)}%`],
            ] as [string, string][]
          ).map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-3">
              <dt className="text-body text-text-secondary">{label}</dt>
              <dd className="tnum text-body-emphasis font-semibold text-text-primary">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-body text-text-muted">
          Not enough completed orders yet — the program measures you once your first sales settle.
        </p>
      )}
      {standards.defects.length ? (
        <ul className="mt-4 space-y-2" aria-label="Standards issues">
          {standards.defects.map((d) => (
            <li
              key={d.metric}
              className="flex items-start gap-2 text-caption text-warning-text"
            >
              <Icon name="warning" size={14} className="mt-px shrink-0" />
              <span>
                <span className="font-medium capitalize">{d.metric.replace(/_/g, ' ')}</span> is{' '}
                {d.actual} — threshold {d.threshold}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Demo standards — only what the fixture queue truthfully computes;
 *  returns and program tier aren't modelled, so they say so. */
function DemoStandards({
  standards,
}: {
  standards: {
    averageShipTimeDays: number | null;
    ordersShipped: number;
    cancellationRate: number;
    returnCaseRate: null;
  };
}) {
  return (
    <div className="mt-3">
      <dl className="divide-y divide-border-subtle border-y border-border-subtle">
        <div className="flex items-center justify-between py-3">
          <dt className="text-body text-text-secondary">Average ship time</dt>
          <dd className="tnum text-body-emphasis font-semibold text-text-primary">
            {standards.averageShipTimeDays != null
              ? `${standards.averageShipTimeDays.toFixed(1)} days`
              : '—'}
          </dd>
        </div>
        <div className="flex items-center justify-between py-3">
          <dt className="text-body text-text-secondary">Orders shipped</dt>
          <dd className="tnum text-body-emphasis font-semibold text-text-primary">
            {standards.ordersShipped}
          </dd>
        </div>
        <div className="flex items-center justify-between py-3">
          <dt className="text-body text-text-secondary">Cancellation rate</dt>
          <dd className="tnum text-body-emphasis font-semibold text-text-primary">
            {(standards.cancellationRate * 100).toFixed(1)}%
          </dd>
        </div>
        <div className="flex items-center justify-between py-3">
          <dt className="text-body text-text-secondary">Return-case rate</dt>
          <dd className="tnum text-body-emphasis font-semibold text-text-primary">—</dd>
        </div>
      </dl>
      <p className="mt-2.5 text-meta text-text-muted">
        Demo mode — ship time and shipped count are computed from the sample fulfilment queue;
        return cases and the performer tier aren&apos;t measured here.
      </p>
    </div>
  );
}
