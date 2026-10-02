'use client';

/**
 * WalletCoOwnPortfolio — fractional asset portfolio summary.
 * Flat canvas with hairline divider (spec 17).
 *
 * Live mode reads the real /co-own/portfolio projection through
 * useCoOwnPositions: holdings cost basis and count are computed from wire
 * rows — nothing is hard-coded. A failed read hides the section (absent
 * beats fabricated). Fixture mode keeps its authored demo numbers.
 */

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import { DATA_MODE } from '@/lib/api/client';
import { useCoOwnPositions } from '@/lib/hooks/coown-queries';
import type { CoOwnPosition } from '@/lib/contracts/coown';

interface WalletCoOwnPortfolioProps {
  balanceHidden?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Σ cost basis — the mapper carries avgEntryPriceGbp = costBasis/units
 *  from the projection, so units × entry reproduces real invested value. */
function portfolioCostBasis(positions: CoOwnPosition[]): number {
  return round2(positions.reduce((sum, p) => sum + p.units * p.avgEntryPriceGbp, 0));
}

function SectionShell({
  title,
  trailing,
  children,
}: {
  title: React.ReactNode;
  trailing: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label="Co-Own portfolio" className="mt-8 px-4 sm:px-6">
      <div className="flex items-baseline justify-between">
        {title}
        {trailing}
      </div>
      <div className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
        {children}
      </div>
    </section>
  );
}

/** Live surface — real positions only, no invented aggregates. */
function LivePortfolio({ balanceHidden }: { balanceHidden: boolean }) {
  const { data: positions, isLoading, isError } = useCoOwnPositions();
  const mask = (val: string) => (balanceHidden ? '••••••' : val);

  // Loading or failed → the section stays absent rather than guessing.
  if (isLoading || isError || !positions) return null;

  if (positions.length === 0) {
    return (
      <SectionShell
        title={
          <h2 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
            Co-Own fractional equity
          </h2>
        }
        trailing={
          <Link
            href="/co-own/pools"
            className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
          >
            Browse pools
          </Link>
        }
      >
        <Link
          href="/co-own/portfolio"
          className="pressable flex items-center gap-3 py-3 text-left"
        >
          <Icon name="layers" size={16} className="shrink-0 text-text-muted" />
          <span className="flex-1 text-body font-medium text-text-primary">
            Co-Own portfolio
          </span>
          <Icon name="forward" size={15} className="shrink-0 text-text-muted" />
        </Link>
      </SectionShell>
    );
  }

  const equity = portfolioCostBasis(positions);

  return (
    <SectionShell
      title={
        <div className="flex items-center gap-1.5">
          <h2 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
            Co-Own fractional equity
          </h2>
          <Badge variant="neutral" className="py-0 text-micro">
            {positions.length} {positions.length === 1 ? 'holding' : 'holdings'}
          </Badge>
        </div>
      }
      trailing={
        <Link
          href="/co-own/portfolio"
          className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
        >
          View portfolio
        </Link>
      }
    >
      <Link
        href="/co-own/portfolio"
        className="pressable flex items-baseline justify-between py-3 text-left"
      >
        <div>
          <span className="text-body font-medium text-text-primary">Invested (cost basis)</span>
          <p className="text-meta text-text-muted">
            Fractional ownership across vetted assets
          </p>
        </div>
        <span className="tnum text-body font-semibold text-text-primary">
          {mask(formatPrice(equity, 'GBP'))}
        </span>
      </Link>
    </SectionShell>
  );
}

/** Fixture surface — authored demo values (fixture mode keeps authored
 *  behavior; these never render in live mode). */
function FixturePortfolio({ balanceHidden }: { balanceHidden: boolean }) {
  const mask = (val: string) => (balanceHidden ? '••••••' : val);
  return (
    <SectionShell
      title={
        <div className="flex items-center gap-1.5">
          <h2 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
            Co-Own fractional equity
          </h2>
          <Badge variant="neutral" className="py-0 text-micro">
            2 syndicates
          </Badge>
        </div>
      }
      trailing={
        <Link
          href="/co-own/pools"
          className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
        >
          View pools
        </Link>
      }
    >
      <div className="flex items-baseline justify-between py-3">
        <div>
          <span className="text-body font-medium text-text-primary">
            Archival asset value
          </span>
          <p className="text-meta text-text-muted">
            Fractional ownership across vetted luxury items
          </p>
        </div>
        <span className="tnum text-body font-semibold text-text-primary">
          {mask(formatPrice(1250, 'GBP'))}
        </span>
      </div>

      <div className="flex items-baseline justify-between py-3">
        <div>
          <span className="text-body text-text-secondary">Earned distributions</span>
          <p className="text-meta text-text-muted">
            Rental dividends &amp; secondary royalties
          </p>
        </div>
        <span className="tnum text-body font-semibold text-coown-up">
          +{mask(formatPrice(42.5, 'GBP'))}
        </span>
      </div>
    </SectionShell>
  );
}

export function WalletCoOwnPortfolio({ balanceHidden = false }: WalletCoOwnPortfolioProps) {
  if (DATA_MODE === 'live') return <LivePortfolio balanceHidden={balanceHidden} />;
  return <FixturePortfolio balanceHidden={balanceHidden} />;
}
