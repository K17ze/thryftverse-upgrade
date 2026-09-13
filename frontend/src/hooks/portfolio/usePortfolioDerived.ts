import React from 'react';
import type { CoOwnPositionVM, CoOwnPortfolioSummary } from '../../services/coOwnPortfolio';
import {
  computeTotalCostBasis,
  computeAllocationBars,
  computeIssuerBands,
  computeClassBars,
  computePerformers,
} from '../../components/portfolio/portfolioViewModels';

/**
 * Owns the memoized portfolio derivations: cost basis, allocation /
 * issuer / class breakdowns, and best/worst performers. The math itself
 * lives in `components/portfolio/portfolioViewModels.ts` so it stays
 * unit-testable — this hook only pins it to the render lifecycle.
 */
export function usePortfolioDerived(
  positions: CoOwnPositionVM[],
  summary: CoOwnPortfolioSummary,
) {
  const totalCostBasisGbp = React.useMemo(
    () => computeTotalCostBasis(positions),
    [positions],
  );

  const allocationBars = React.useMemo(
    () => computeAllocationBars(positions, summary.totalValueGbp),
    [positions, summary.totalValueGbp],
  );

  const issuerBands = React.useMemo(
    () => computeIssuerBands(positions, summary.totalValueGbp),
    [positions, summary.totalValueGbp],
  );

  const classBars = React.useMemo(
    () => computeClassBars(positions, summary.totalValueGbp),
    [positions, summary.totalValueGbp],
  );

  const performers = React.useMemo(
    () => computePerformers(positions),
    [positions],
  );

  return {
    totalCostBasisGbp,
    allocationBars,
    issuerBands,
    classBars,
    performers,
  };
}
