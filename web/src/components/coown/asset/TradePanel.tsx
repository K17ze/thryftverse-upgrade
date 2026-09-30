'use client';

/**
 * TradePanel — the composer for fractional co-ownership trading.
 * Side + order type + units + limit price, live execution plan from
 * planExecution, and submit gated by real ledger constraints.
 * Factored into domain components (<400 LOC standard):
 *  - TradePositionHeader
 *  - TradeQuoteCard
 *  - TradeReceiptView
 *  - TradeReviewCard
 *  - FirstTradeGate
 *  - TradeMarketNotices
 *  - TradeFormComposer
 *  - useTradeWorkflow
 */

import { formatIze } from '@/components/wallet/convertViewModel';
import type {
  CoOwnAsset,
  OrderBookLevel,
} from '@/lib/contracts/coown';
import { TradeReceiptView } from './trading/TradeReceiptView';
import { TradeReviewCard } from './trading/TradeReviewCard';
import { FirstTradeGate } from './trading/FirstTradeGate';
import { TradePositionHeader } from './trading/TradePositionHeader';
import { TradeFormComposer } from './trading/TradeFormComposer';
import { useTradeWorkflow, type TradePrefill } from './trading/useTradeWorkflow';

// Re-exported notices for external consumers (e.g. AssetDetailView)
export {
  PausedNotice,
  DelistedPanel,
  PreviewPanel,
} from './trading/TradeMarketNotices';
export type { TradePrefill } from './trading/useTradeWorkflow';

export function TradePanel({
  asset,
  bids,
  asks,
  position,
  prefill,
}: {
  asset: CoOwnAsset;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  position: { units: number; avgEntryPriceGbp: number } | null;
  prefill?: TradePrefill | null;
}) {
  const workflow = useTradeWorkflow({
    asset,
    bids,
    asks,
    position,
    prefill,
  });

  // A fully-closed position (0 units left after a sell) is not a holding
  // — the row only renders while units remain.
  const held = position && position.units > 0 ? position : null;

  return (
    <div>
      {held && (
        <TradePositionHeader
          units={held.units}
          avgEntryPriceGbp={held.avgEntryPriceGbp}
          markPriceGbp={workflow.mark}
        />
      )}

      {workflow.receipt ? (
        <TradeReceiptView
          result={workflow.receipt}
          onDone={() => {
            workflow.setReceipt(null);
            workflow.setReviewing(false);
          }}
        />
      ) : workflow.reviewing ? (
        <TradeReviewCard
          asset={asset}
          side={workflow.side}
          orderType={workflow.orderType}
          units={workflow.units}
          limitPriceGbp={workflow.limitPriceGbp}
          duration={workflow.duration}
          quote={workflow.quote}
          prepared={workflow.prepared}
          marketMoved={workflow.marketMoved}
          liveBestPriceGbp={workflow.liveBestPrice}
          onExpire={workflow.onReservationExpired}
          maxReservedLabel={
            workflow.prepared
              ? // Server-quoted hold — the real reserved figure.
                workflow.prepared.reservation.side === 'buy'
                ? `${formatIze(workflow.prepared.reservation.reserved1zeUnits / 1000)} 1ZE`
                : `${workflow.prepared.reservation.reservedUnits} ${
                    workflow.prepared.reservation.reservedUnits === 1 ? 'unit' : 'units'
                  }`
              : workflow.side === 'buy'
                ? `${formatIze(workflow.requiredIze)} 1ZE`
                : `${workflow.units} ${workflow.units === 1 ? 'unit' : 'units'}`
          }
          requireHold={workflow.requireHold}
          holdReason={workflow.holdReason}
          submitting={workflow.submitting}
          riskDocument={workflow.riskNeeded ? workflow.riskDoc : null}
          riskAccepted={workflow.riskAccepted}
          onRiskAcceptedChange={workflow.setRiskAccepted}
          onBack={() => {
            workflow.releasePrepared();
            workflow.setReviewing(false);
          }}
          onConfirm={workflow.confirm}
        />
      ) : !workflow.educated ? (
        <FirstTradeGate
          assetTitle={asset.title}
          onComplete={workflow.completeEducation}
        />
      ) : (
        <TradeFormComposer
          asset={asset}
          held={Boolean(held)}
          side={workflow.side}
          setSide={workflow.setSide}
          canBuy={workflow.canBuy}
          canSell={workflow.canSell}
          orderType={workflow.orderType}
          setOrderType={workflow.setOrderType}
          unitsText={workflow.unitsText}
          setUnitsText={workflow.setUnitsText}
          maxOrderUnits={workflow.maxOrderUnits}
          holdingUnits={workflow.holdingUnits}
          bump={workflow.bump}
          limitText={workflow.limitText}
          setLimitText={workflow.setLimitText}
          setLimitTouched={workflow.setLimitTouched}
          bestAsk={workflow.bestAsk}
          bestBid={workflow.bestBid}
          duration={workflow.duration}
          setDuration={workflow.setDuration}
          quote={workflow.quote}
          izeAvailable={workflow.izeAvailable}
          requiredIze={workflow.requiredIze}
          canSubmit={workflow.canSubmit}
          submitting={workflow.submitting}
          preparing={workflow.preparing}
          isGuest={workflow.isGuest}
          walletIzePresent={Boolean(workflow.wallet?.ize)}
          reason={workflow.reason}
          onSubmit={workflow.openReview}
        />
      )}
      {workflow.wall}
    </div>
  );
}
