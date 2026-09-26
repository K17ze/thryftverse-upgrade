'use client';

import { AllocationBar } from '@/components/charts';
import { gbp, signedGbp, signedPct, ALLOCATION_COLORS } from './format';

export interface AllocationSlice {
  id: string;
  title: string;
  value: number;
  pct: number;
}

export interface PortfolioSummaryProps {
  marketValue: number;
  cost: number;
  returnGbp: number;
  returnPct: number;
  todayMove: number;
  realized: number;
  /** Paid income in the fixture-anchored income year. */
  incomeYtd: number;
  incomeYear: number;
  positions: AllocationSlice[];
}

/** Portfolio summary — one dominant number, hairline stat rail, allocation strip. */
export function PortfolioSummary({
  marketValue,
  cost,
  returnGbp,
  returnPct,
  todayMove,
  realized,
  incomeYtd,
  incomeYear,
  positions,
}: PortfolioSummaryProps) {
  const up = returnPct >= 0;
  const todayUp = todayMove >= 0;
  const segments = positions.map((p, i) => ({
    label: p.title,
    pct: p.pct,
    color: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]!,
  }));

  return (
    <section aria-label="Portfolio summary" className="border-b border-border-subtle pb-8">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h2 className="sr-only">Summary</h2>
        <p className="text-display font-semibold text-text-primary tnum">{gbp(marketValue)}</p>
        <p className={`text-body-emphasis tnum ${up ? 'text-coown-up' : 'text-coown-down'}`}>
          {signedGbp(returnGbp)}{' '}
          <span className="text-text-secondary">({signedPct(returnPct)})</span>
          <span className="ml-1.5 text-meta font-normal text-text-muted">all time</span>
        </p>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-border-subtle pt-5 sm:grid-cols-4">
        <div>
          <dt className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Cost basis</dt>
          <dd className="mt-1 text-body-emphasis text-text-primary tnum">{gbp(cost)}</dd>
        </div>
        <div>
          <dt className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">24h move</dt>
          <dd className={`mt-1 text-body-emphasis tnum ${todayUp ? 'text-coown-up' : 'text-coown-down'}`}>
            {signedGbp(todayMove)}{' '}
            <span className="text-text-secondary">
              ({signedPct((todayMove / Math.max(marketValue - todayMove, 1)) * 100)})
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">Realized profit</dt>
          <dd className={`mt-1 text-body-emphasis tnum ${realized > 0 ? 'text-coown-up' : 'text-text-primary'}`}>
            {signedGbp(realized)}
          </dd>
        </div>
        <div>
          <dt className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
            Income {incomeYear} YTD
          </dt>
          <dd className="mt-1 text-body-emphasis text-text-primary tnum">{gbp(incomeYtd)}</dd>
        </div>
      </dl>

      <div className="mt-6">
        <AllocationBar segments={segments} />
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
          {positions.map((p, i) => (
            <li key={p.title} className="flex items-center gap-1.5 text-meta text-text-secondary">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }}
                aria-hidden="true"
              />
              <span className="clamp-1 max-w-40">{p.title}</span>
              <span className="text-text-muted tnum">{Math.round(p.pct)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
