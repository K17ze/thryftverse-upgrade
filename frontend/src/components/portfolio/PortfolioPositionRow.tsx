import React from 'react';
import { CoOwnPositionCard } from '../coown';
import type { CoOwnPositionVM } from '../../services/coOwnPortfolio';
import { formatPositionStatus, formatQuoteAge, type FormatFromFiat } from './portfolioViewModels';

export interface PortfolioPositionRowProps {
  item: CoOwnPositionVM;
  index: number;
  formatFromFiat: FormatFromFiat;
  onPress: (position: CoOwnPositionVM) => void;
  onBuyMore: (position: CoOwnPositionVM) => void;
  onSell: (position: CoOwnPositionVM) => void;
}

/**
 * Single position row — maps a CoOwnPositionVM onto the shared
 * CoOwnPositionCard (labels, quote age, status, mark, lockup).
 */
export function PortfolioPositionRow({
  item,
  index,
  formatFromFiat,
  onPress,
  onBuyMore,
  onSell,
}: PortfolioPositionRowProps) {
  return (
    <CoOwnPositionCard
      imageUri={item.imageUrl}
      title={item.title}
      unitsOwned={item.unitsOwned}
      totalUnits={item.totalUnits}
      ownershipPct={item.ownershipPct}
      currentValueLabel={formatFromFiat(item.currentValueGbp, 'GBP')}
      estimatedSaleProceedsLabel={item.estimatedSaleProceedsGbp === null
        ? 'No current bids'
        : formatFromFiat(item.estimatedSaleProceedsGbp, 'GBP')}
      saleDepthLabel={item.estimatedSaleProceedsGbp === null
        ? undefined
        : `Bid depth: ${item.saleDepthUnits} units`}
      partialLiquidityLabel={item.estimatedSaleProceedsGbp === null
        ? undefined
        : `Can sell ${item.saleDepthUnits} of ${item.unitsOwned} units at current bid`}
      saleQuoteAgeLabel={item.saleProceedsAsOf
        ? `Quote ${formatQuoteAge(item.saleProceedsAsOf)} old`
        : undefined}
      avgEntryLabel={formatFromFiat(item.avgEntryPriceGbp, 'GBP')}
      unrealizedLabel={item.unrealizedPnlGbp >= 0
        ? `+${formatFromFiat(Math.abs(item.unrealizedPnlGbp), 'GBP')}`
        : `-${formatFromFiat(Math.abs(item.unrealizedPnlGbp), 'GBP')}`
      }
      realizedLabel={item.realizedPnlGbp !== 0
        ? (item.realizedPnlGbp >= 0
          ? `+${formatFromFiat(Math.abs(item.realizedPnlGbp), 'GBP')}`
          : `-${formatFromFiat(Math.abs(item.realizedPnlGbp), 'GBP')}`)
        : undefined
      }
      status={formatPositionStatus(item)}
      sellable={item.sellableUnits > 0}
      onPress={() => onPress(item)}
      onBuyMore={() => onBuyMore(item)}
      onSell={() => onSell(item)}
      index={index}
      positionState={item.positionState}
      settlementState={item.settlementState}
      mark={item.mark}
      markValueLabel={formatFromFiat(item.markedValueGbp, 'GBP')}
      lockupEndDate={item.lockupEndDate ?? null}
    />
  );
}
