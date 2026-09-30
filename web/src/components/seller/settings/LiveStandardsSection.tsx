'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useSubmitStandardsAppeal } from '@/lib/hooks/seller-queries';
import type { StandardsAppealGrounds } from '@/lib/api/services/sellerHub';

const TIER_COPY: Record<string, { label: string; variant: 'success' | 'warning' | 'neutral' }> = {
  top_performer: { label: 'Top performer', variant: 'success' },
  performer: { label: 'Performer', variant: 'success' },
  standard: { label: 'Standard', variant: 'neutral' },
};

const DEFECT_LABEL: Record<string, string> = {
  ordersShipped: 'Lifetime orders shipped',
  ordersInWindow: 'Orders in 90 days',
  salesVolume: 'Sales in 90 days',
  averageShipTimeDays: 'Average ship time',
  cancellationRate: 'Cancellation rate',
  returnCaseRate: 'Return case rate',
};

const defectLabel = (metric: string) => DEFECT_LABEL[metric] ?? metric;

const APPEAL_GROUNDS: { key: StandardsAppealGrounds; label: string }[] = [
  { key: 'factual_error', label: 'Factual error' },
  { key: 'carrier_delay', label: 'Carrier delay' },
  { key: 'system_error', label: 'System error' },
  { key: 'mitigating_circumstance', label: 'Mitigating circumstance' },
];

interface LiveStandardsSectionProps {
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
}

export function LiveStandardsSection({ standards }: LiveStandardsSectionProps) {
  const { show } = useToast();
  const submitAppeal = useSubmitStandardsAppeal();
  const tier = TIER_COPY[standards.tier] ?? TIER_COPY.standard;
  const m = standards.metrics;

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
