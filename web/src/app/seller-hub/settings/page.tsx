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
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/settings/Switch';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import { formatDate } from '@/lib/utils/format';
import type { StandardsAppealGrounds } from '@/lib/api/services/sellerHub';
import {
  useFulfilmentCounts,
  useSellerStandards,
  useShopAway,
  useSubmitStandardsAppeal,
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

/** Display labels for the backend's verbatim defect metric keys
 *  (mobile DEFECT_METRIC_META parity — camelCase keys never render raw). */
const DEFECT_LABEL: Record<string, string> = {
  ordersShipped: 'Lifetime orders shipped',
  ordersInWindow: 'Orders in 90 days',
  salesVolume: 'Sales in 90 days',
  averageShipTimeDays: 'Average ship time',
  cancellationRate: 'Cancellation rate',
  returnCaseRate: 'Return case rate',
};

const defectLabel = (metric: string) => DEFECT_LABEL[metric] ?? metric;

/** The appeal grounds enum — the backend's contract verbatim. */
const APPEAL_GROUNDS: { key: StandardsAppealGrounds; label: string }[] = [
  { key: 'factual_error', label: 'Factual error' },
  { key: 'carrier_delay', label: 'Carrier delay' },
  { key: 'system_error', label: 'System error' },
  { key: 'mitigating_circumstance', label: 'Mitigating circumstance' },
];

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
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12 lg:max-w-[1440px]">
      <h1 className="text-screen-title text-text-primary">Shop settings</h1>
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
        {/* Two settings panes side-by-side at lg — the toggle list and the
            standards ledger are peers, not a stack. */}
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-16">
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
          <section aria-label="Seller standards" className="mt-10 lg:mt-8">
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
        </div>
        </>
      )}
    </div>
  );
}

/** Live program metrics — the /sellers/:id/standards projection verbatim,
 *  plus the real appeal write (mobile SellerStandardsModule parity). The
 *  affordance renders only while the server reports appealsAvailable; the
 *  form collects the contract's required fields — defect metric, grounds,
 *  details — and submits to POST /sellers/:id/standards/appeal. */
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
  const { show } = useToast();
  const submitAppeal = useSubmitStandardsAppeal();
  const tier = TIER_COPY[standards.tier] ?? TIER_COPY.standard;
  const m = standards.metrics;

  // Appeal flow — gated on appealsAvailable (defects exist), one open
  // appeal per (seller, metric) is enforced server-side.
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealMetric, setAppealMetric] = useState<string | null>(null);
  const [appealGrounds, setAppealGrounds] = useState<StandardsAppealGrounds>('factual_error');
  const [appealDetails, setAppealDetails] = useState('');
  const [appealResult, setAppealResult] = useState<'submitted' | 'error' | null>(null);

  const defects = standards.defects;
  const selectedMetric = appealMetric ?? defects[0]?.metric ?? null;
  const detailsReady = appealDetails.trim().length > 0;

  const submit = () => {
    if (!selectedMetric || !detailsReady || submitAppeal.isPending) return;
    submitAppeal.mutate(
      {
        defectMetric: selectedMetric,
        grounds: appealGrounds,
        details: appealDetails.trim(),
      },
      {
        onSuccess: () => {
          setAppealResult('submitted');
          setAppealOpen(false);
          setAppealDetails('');
          show('Appeal submitted — under review', 'success');
        },
        onError: () => {
          setAppealResult('error');
          show("Appeal couldn't be submitted — try again", 'error');
        },
      },
    );
  };

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <Badge variant={tier.variant}>{tier.label}</Badge>
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
      {defects.length ? (
        <ul className="mt-4 space-y-2" aria-label="Standards issues">
          {defects.map((d) => (
            <li
              key={d.metric}
              className="flex items-start gap-2 text-caption text-warning-text"
            >
              <Icon name="warning" size={14} className="mt-px shrink-0" />
              <span>
                <span className="font-medium">{defectLabel(d.metric)}</span> is{' '}
                {d.actual} — threshold {d.threshold}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Appeal — native SellerStandardsModule grammar: a quiet entry row
          opens the inline form; the submitted state replaces it. The
          affordance exists only while the server says an appeal can land. */}
      {appealResult === 'submitted' ? (
        <p className="mt-3 text-meta text-text-muted">
          Appeal submitted — under review.
        </p>
      ) : null}
      {appealResult === 'error' && !appealOpen ? (
        <p role="alert" className="mt-3 text-meta text-danger-text">
          Appeal couldn&apos;t be submitted — try again.
        </p>
      ) : null}

      {standards.appealsAvailable && appealResult !== 'submitted' ? (
        appealOpen ? (
          <div className="mt-4 space-y-4">
            {defects.length > 1 ? (
              <div>
                <p className="text-caption font-medium text-text-secondary">
                  Defect to appeal
                </p>
                <div
                  role="radiogroup"
                  aria-label="Defect to appeal"
                  className="mt-2 divide-y divide-border-subtle border-y border-border-subtle"
                >
                  {defects.map((d) => (
                    <button
                      key={d.metric}
                      type="button"
                      role="radio"
                      aria-checked={selectedMetric === d.metric}
                      onClick={() => setAppealMetric(d.metric)}
                      className="pressable flex w-full items-center justify-between gap-3 py-2.5 text-left"
                    >
                      <span
                        className={`text-caption font-medium ${
                          selectedMetric === d.metric
                            ? 'text-text-primary'
                            : 'text-text-secondary'
                        }`}
                      >
                        {defectLabel(d.metric)}
                      </span>
                      {selectedMetric === d.metric ? (
                        <Icon name="check" size={14} className="shrink-0 text-brand" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <p className="text-caption font-medium text-text-secondary">Grounds</p>
              <div
                role="radiogroup"
                aria-label="Appeal grounds"
                className="mt-2 divide-y divide-border-subtle border-y border-border-subtle"
              >
                {APPEAL_GROUNDS.map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    role="radio"
                    aria-checked={appealGrounds === g.key}
                    onClick={() => setAppealGrounds(g.key)}
                    className="pressable flex w-full items-center justify-between gap-3 py-2.5 text-left"
                  >
                    <span
                      className={`text-caption font-medium ${
                        appealGrounds === g.key
                          ? 'text-text-primary'
                          : 'text-text-secondary'
                      }`}
                    >
                      {g.label}
                    </span>
                    {appealGrounds === g.key ? (
                      <Icon name="check" size={14} className="shrink-0 text-brand" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-caption font-medium text-text-secondary">
                What happened?
              </span>
              <textarea
                value={appealDetails}
                onChange={(e) => setAppealDetails(e.target.value)}
                rows={3}
                maxLength={2000}
                disabled={submitAppeal.isPending}
                placeholder="Keep it factual — what the metric got wrong."
                className="mt-2 w-full resize-y rounded-md border border-border bg-input px-3.5 py-2.5 text-body text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none"
              />
            </label>

            {appealResult === 'error' ? (
              <p role="alert" className="text-meta text-danger-text">
                Appeal couldn&apos;t be submitted — try again.
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                variant="quiet"
                size="sm"
                onClick={() => {
                  setAppealOpen(false);
                  setAppealResult(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!detailsReady || submitAppeal.isPending}
                onClick={submit}
              >
                {submitAppeal.isPending ? 'Submitting…' : 'Submit appeal'}
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAppealMetric(defects[0]?.metric ?? null);
              setAppealResult(null);
              setAppealOpen(true);
            }}
            className="pressable mt-2 flex w-full items-center gap-2 border-t border-border-subtle py-3 text-left"
          >
            <Icon name="flag" size={14} className="shrink-0 text-text-secondary" />
            <span className="flex-1 text-caption font-medium text-text-secondary">
              Appeal a defect
            </span>
            <Icon name="forward" size={14} className="shrink-0 text-text-muted" />
          </button>
        )
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
