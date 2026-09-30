'use client';

/**
 * TradePanel — the composer for fractional co-ownership trading.
 * Side + order type + units + limit price, live execution plan from
 * planExecution, and submit gated by real ledger constraints.
 * Factored into domain components: TradeQuoteCard, TradeReceiptView,
 * TradeReviewCard, FirstTradeGate, and TradeMarketNotices.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import { CO_OWN_FEE_RATE, CO_OWN_MAX_UNITS } from '@/lib/utils/trade';
import type {
  CoOwnAsset,
  OrderBookLevel,
  OrderDuration,
  OrderType,
  TradeSide,
} from '@/lib/contracts/coown';
import { coOwnMarkGbp } from '@/lib/contracts/coown';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { useOnlineStatus } from '@/lib/offline';
import {
  useCoOwnEligibility,
  useCoOwnPolicy,
  useRiskDisclosure,
} from '@/lib/hooks/coown-queries';
import * as coownService from '@/lib/api/services/coown';
import { useQueryClient } from '@tanstack/react-query';
import { useWalletData } from '@/components/wallet/useWalletData';
import {
  GBP_PER_USD,
  formatIze,
  round2,
} from '@/components/wallet/convertViewModel';
import {
  planExecution,
  type ExecutionPlan,
} from '@/components/trading/orderExecution';
import {
  usePlaceCoOwnOrder,
  type PlaceOrderResult,
  type PreparedLiveOrder,
} from '@/components/trading/useCoOwnTrading';
import { gbp, signedGbp, signedPct } from '../format';

// Domain components
import { TradeQuoteCard, type QuoteDisplay } from './trading/TradeQuoteCard';
import { TradeReceiptView } from './trading/TradeReceiptView';
import { TradeReviewCard } from './trading/TradeReviewCard';
import { FirstTradeGate } from './trading/FirstTradeGate';

// Re-exported notices for external consumers (e.g. AssetDetailView)
export {
  PausedNotice,
  DelistedPanel,
  PreviewPanel,
} from './trading/TradeMarketNotices';

const SIDE_LABEL = { buy: 'Buy', sell: 'Sell' } as const;

export interface TradePrefill {
  price: number;
  side: TradeSide;
  seq: number;
}

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
  const { isGuest, user } = useSession();
  const { requireAuth, wall } = useSignupWall();
  const { data: wallet } = useWalletData();
  const { prepareOrder, placeOrder } = usePlaceCoOwnOrder();
  const queryClient = useQueryClient();
  const { show } = useToast();

  const { data: eligibility } = useCoOwnEligibility(asset.id);
  const { data: policy } = useCoOwnPolicy();
  const maxOrderUnits =
    DATA_MODE === 'live' ? (policy?.maxOrderUnits ?? CO_OWN_MAX_UNITS) : CO_OWN_MAX_UNITS;
  const { data: riskDisclosure } = useRiskDisclosure();
  const { isOffline } = useOnlineStatus();

  const [side, setSide] = useState<TradeSide>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [unitsText, setUnitsText] = useState('1');
  const [limitText, setLimitText] = useState('');
  const [limitTouched, setLimitTouched] = useState(false);
  const [duration, setDuration] = useState<OrderDuration>('gtc');
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<PreparedLiveOrder | null>(null);
  const preparedRef = useRef<PreparedLiveOrder | null>(null);
  const [receipt, setReceipt] = useState<PlaceOrderResult | null>(null);
  const [educated, setEducated] = useState(true);
  const [riskAccepted, setRiskAccepted] = useState(false);
  const appliedSeq = useRef(-1);
  const attemptKey = useRef<string | null>(null);

  const bestAsk = asks[0]?.unitPriceGbp ?? null;
  const bestBid = bids[0]?.unitPriceGbp ?? null;

  useEffect(() => {
    setEducated(
      window.localStorage.getItem('thryftverse:coown-onboarded') === '1',
    );
  }, []);

  const completeEducation = () => {
    window.localStorage.setItem('thryftverse:coown-onboarded', '1');
    setEducated(true);
  };

  const feeRate = asset.dossier?.tradingFeeRate ?? CO_OWN_FEE_RATE;
  const canBuy = asset.capabilities?.buy !== false;
  const canSell = asset.capabilities?.sell !== false;

  useEffect(() => {
    if (side === 'sell' && !canSell && canBuy) setSide('buy');
    else if (side === 'buy' && !canBuy && canSell) setSide('sell');
  }, [side, canBuy, canSell]);

  useEffect(() => {
    if (!prefill || prefill.seq === appliedSeq.current) return;
    appliedSeq.current = prefill.seq;
    setSide(prefill.side);
    setOrderType('limit');
    setLimitText(prefill.price.toFixed(2));
    setLimitTouched(true);
  }, [prefill]);

  useEffect(() => {
    if (orderType !== 'limit' || limitTouched) return;
    const ref = side === 'buy' ? bestAsk : bestBid;
    if (ref != null) setLimitText(ref.toFixed(2));
  }, [orderType, side, bestAsk, bestBid, limitTouched]);

  const units = Math.min(maxOrderUnits, Math.max(0, Number(unitsText) || 0));
  const limitPriceGbp =
    orderType === 'limit' && Number(limitText) > 0 ? Number(limitText) : null;

  const effectiveAsks = useMemo<OrderBookLevel[]>(() => {
    if (DATA_MODE !== 'live' || side !== 'buy' || asset.availableUnits <= 0) return asks;
    const poolUnits = asset.availableUnits;
    const poolPrice = asset.unitPriceGbp;
    const merged = asks.map((l) =>
      l.unitPriceGbp === poolPrice ? { ...l, units: l.units + poolUnits } : l,
    );
    if (!asks.some((l) => l.unitPriceGbp === poolPrice)) {
      merged.push({ side: 'sell', unitPriceGbp: poolPrice, units: poolUnits, orderCount: 1 });
    }
    return merged.sort((a, b) => a.unitPriceGbp - b.unitPriceGbp);
  }, [asks, side, asset.availableUnits, asset.unitPriceGbp]);

  const plan = useMemo<ExecutionPlan>(
    () =>
      planExecution({
        side,
        orderType,
        units,
        limitPriceGbp,
        bids,
        asks: effectiveAsks,
      }),
    [side, orderType, units, limitPriceGbp, bids, effectiveAsks],
  );

  const quote = useMemo<QuoteDisplay>(() => {
    const restingGross = plan.restingUnits * (limitPriceGbp ?? 0);
    const gross = round2(plan.fillGrossGbp + restingGross);
    const fee = round2(gross * feeRate);
    return {
      side,
      orderType,
      estimate:
        plan.filledUnits > 0
          ? {
              filledUnits: plan.filledUnits,
              avgFillPriceGbp: plan.avgFillPriceGbp ?? 0,
              worstPriceGbp: plan.worstFillPriceGbp ?? 0,
            }
          : null,
      restingUnits: plan.restingUnits,
      grossNotionalGbp: gross,
      feeGbp: fee,
      feeRatePct: Number((feeRate * 100).toFixed(2)),
      totalGbp: side === 'buy' ? round2(gross + fee) : round2(gross - fee),
    };
  }, [plan, limitPriceGbp, side, orderType, feeRate]);

  const holdingUnits = position?.units ?? 0;
  const izeAvailable = wallet?.ize ? round2(wallet.ize.settled - wallet.ize.reserved) : null;
  const requiredIze = round2(plan.requiredGbp / GBP_PER_USD);

  let canSubmit = false;
  let reason: string | null = null;
  if (!Number.isInteger(units) || units <= 0) {
    reason = 'Enter a whole number of units';
  } else if (units > maxOrderUnits) {
    reason = `Maximum ${maxOrderUnits} units per order`;
  } else if (orderType === 'limit' && (limitPriceGbp == null || limitPriceGbp <= 0)) {
    reason = 'Set a limit price';
  } else if (isOffline) {
    reason = "You're offline — orders can't be placed until you reconnect";
  } else if (eligibility && !eligibility.eligible) {
    reason = eligibility.reason ?? "This order isn't available for your account";
  } else if (isGuest) {
    canSubmit = true;
  } else if (!wallet) {
    reason = 'Checking your 1ZE balance…';
  } else if (side === 'buy' && wallet.ize == null) {
    reason = "Your 1ZE balance couldn't be loaded — buys are unavailable";
  } else if (side === 'sell' && units > holdingUnits) {
    reason =
      holdingUnits > 0
        ? `You hold ${holdingUnits} ${holdingUnits === 1 ? 'unit' : 'units'} — can't sell more than that`
        : 'You hold no units to sell';
  } else if (orderType !== 'limit' && plan.filledUnits < units) {
    reason =
      plan.filledUnits === 0
        ? 'No orders on the book within range'
        : `Only ${plan.filledUnits} units available${
            orderType === 'protected_market' ? ' within your protection price' : ' on the book'
          }`;
  } else if (side === 'buy' && (izeAvailable == null || requiredIze > izeAvailable + 0.005)) {
    reason =
      izeAvailable == null
        ? 'Checking your 1ZE balance…'
        : 'Not enough 1ZE — convert GBP in your wallet to fund this order';
  } else {
    canSubmit = true;
  }

  const HOLD_NOTIONAL_IZE = 5000;
  const HOLD_FLOAT_PCT = 0.05;
  const exceedsValueBand = side === 'buy' && requiredIze > HOLD_NOTIONAL_IZE;
  const exceedsFloatBand =
    asset.totalUnits > 0 && units / asset.totalUnits > HOLD_FLOAT_PCT;
  const requireHold = exceedsValueBand || exceedsFloatBand;
  const holdReason = exceedsFloatBand
    ? 'Large order relative to asset supply — press and hold to confirm.'
    : 'High-value order — press and hold to confirm.';

  const bump = (delta: number) =>
    setUnitsText(String(Math.min(maxOrderUnits, Math.max(1, units + delta))));

  const releasePrepared = () => {
    const p = preparedRef.current;
    preparedRef.current = null;
    setPrepared(null);
    if (p) {
      void coownService.releaseCoOwnReservation(asset.id, p.reservation.id).catch(() => {});
    }
  };

  useEffect(
    () => () => {
      const p = preparedRef.current;
      if (p) {
        void coownService.releaseCoOwnReservation(asset.id, p.reservation.id).catch(() => {});
      }
    },
    [asset.id],
  );

  const openReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting || preparing) return;
    if (!requireAuth('purchase')) return;
    attemptKey.current = coownService.newCoOwnOrderAttemptKey();
    if (DATA_MODE !== 'live') {
      setReviewing(true);
      return;
    }
    setPreparing(true);
    try {
      const p = await prepareOrder({
        asset,
        side,
        orderType,
        units,
        limitPriceGbp,
        duration,
        bids,
        asks: effectiveAsks,
      });
      preparedRef.current = p;
      setPrepared(p);
      setReviewing(true);
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not prepare this order', 'error');
    } finally {
      setPreparing(false);
    }
  };

  const riskDoc = riskDisclosure?.document ?? null;
  const riskNeeded =
    DATA_MODE === 'live' && riskDoc != null && riskDisclosure?.accepted === false;

  const confirm = async () => {
    if (submitting || (riskNeeded && !riskAccepted)) return;
    setSubmitting(true);
    try {
      if (riskNeeded && riskDoc && user) {
        await coownService.acceptRiskDisclosure(user.id, riskDoc.id, {
          assetId: asset.id,
          surface: 'coown_trade_review',
        });
        void queryClient.invalidateQueries({
          queryKey: ['compliance', 'risk-disclosure'],
        });
        void queryClient.invalidateQueries({
          queryKey: ['coown', 'eligibility'],
        });
      }
      const result = await placeOrder({
        asset,
        side,
        orderType,
        units,
        limitPriceGbp,
        duration,
        bids,
        asks: effectiveAsks,
        prepared,
        idempotencyKey:
          attemptKey.current ?? coownService.newCoOwnOrderAttemptKey(),
      });
      preparedRef.current = null;
      setPrepared(null);
      setReceipt(result);
    } catch (err) {
      if (preparedRef.current && Date.now() >= preparedRef.current.validUntilMs) {
        preparedRef.current = null;
        setPrepared(null);
      }
      show(
        err instanceof Error
          ? err.message
          : side === 'sell'
            ? 'Order refused — check your holdings and try again'
            : 'Order refused — check your 1ZE balance and try again',
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onReservationExpired = () => {
    releasePrepared();
    setReviewing(false);
    show('That quote expired — review the order again', 'info');
  };

  const lockedRefPrice = prepared?.preview.estimatedFill.filledUnits
    ? prepared.preview.estimatedFill.avgFillPrice
    : (prepared?.preview.estimatedFill.worstPrice ?? limitPriceGbp ?? null);
  const liveBestPrice = reviewing
    ? side === 'buy'
      ? (effectiveAsks[0]?.unitPriceGbp ?? null)
      : bestBid
    : null;
  const quoteDriftPct =
    lockedRefPrice != null && liveBestPrice != null
      ? side === 'buy'
        ? ((lockedRefPrice - liveBestPrice) / lockedRefPrice) * 100
        : ((liveBestPrice - lockedRefPrice) / liveBestPrice) * 100
      : null;
  const marketMoved = quoteDriftPct != null && quoteDriftPct > 2;

  const held = position && position.units > 0 ? position : null;
  const mark = coOwnMarkGbp(asset);
  const marketValue = held ? held.units * mark : 0;
  const unrealised = held
    ? (mark - held.avgEntryPriceGbp) * held.units
    : 0;
  const unrealisedPct = held && held.avgEntryPriceGbp > 0
    ? (mark / held.avgEntryPriceGbp - 1) * 100
    : null;

  return (
    <div>
      {held && (
        <div className="border-b border-border-subtle pb-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
              Your position
            </h3>
            <span className="text-body-emphasis font-semibold text-text-primary tnum">
              {held.units} {held.units === 1 ? 'unit' : 'units'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between text-meta text-text-secondary tnum">
            <span>
              Avg entry {gbp(held.avgEntryPriceGbp)} · Value {gbp(marketValue)}
            </span>
            <span className={`font-semibold ${unrealised >= 0 ? 'text-coown-up' : 'text-coown-down'}`}>
              {signedGbp(unrealised)} ({signedPct(unrealisedPct)})
            </span>
          </div>
        </div>
      )}

      {receipt ? (
        <TradeReceiptView
          result={receipt}
          onDone={() => {
            setReceipt(null);
            setReviewing(false);
          }}
        />
      ) : reviewing ? (
        <TradeReviewCard
          asset={asset}
          side={side}
          orderType={orderType}
          units={units}
          limitPriceGbp={limitPriceGbp}
          duration={duration}
          quote={quote}
          prepared={prepared}
          marketMoved={marketMoved}
          liveBestPriceGbp={liveBestPrice}
          onExpire={onReservationExpired}
          maxReservedLabel={
            prepared
              ? prepared.reservation.side === 'buy'
                ? `${formatIze(prepared.reservation.reserved1zeUnits / 1000)} 1ZE`
                : `${prepared.reservation.reservedUnits} ${
                    prepared.reservation.reservedUnits === 1 ? 'unit' : 'units'
                  }`
              : side === 'buy'
                ? `${formatIze(requiredIze)} 1ZE`
                : `${units} ${units === 1 ? 'unit' : 'units'}`
          }
          requireHold={requireHold}
          holdReason={holdReason}
          submitting={submitting}
          riskDocument={riskNeeded ? riskDoc : null}
          riskAccepted={riskAccepted}
          onRiskAcceptedChange={setRiskAccepted}
          onBack={() => {
            releasePrepared();
            setReviewing(false);
          }}
          onConfirm={confirm}
        />
      ) : !educated ? (
        <FirstTradeGate
          assetTitle={asset.title}
          onComplete={completeEducation}
        />
      ) : (
        <form onSubmit={openReview} className={held ? 'mt-4' : ''} aria-label={`Trade ${asset.title}`}>
          <fieldset>
            <legend className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
              Side
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2" role="group">
              {(['buy', 'sell'] as const).map((s) => {
                const allowed = s === 'buy' ? canBuy : canSell;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={side === s}
                    disabled={!allowed}
                    title={
                      !allowed
                        ? `${SIDE_LABEL[s]} isn't available while this market is ${asset.marketStatus.replace('_', ' ')}`
                        : undefined
                    }
                    onClick={() => setSide(s)}
                    className={`pressable h-11 rounded-md border text-body-emphasis font-semibold ${
                      !allowed
                        ? 'cursor-not-allowed border-border-subtle text-text-muted opacity-50'
                        : side === s
                          ? s === 'buy'
                            ? 'border-coown-up/40 bg-coown-up-subtle text-coown-up'
                            : 'border-coown-down/40 bg-coown-down-subtle text-coown-down'
                          : 'border-border-subtle text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {SIDE_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-4">
            <label htmlFor="coown-order-type" className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
              Order type
            </label>
            <div className="mt-2">
              <SegmentedControl
                options={[
                  { value: 'market' as const, label: 'Market' },
                  { value: 'limit' as const, label: 'Limit' },
                  { value: 'protected_market' as const, label: 'Protected' },
                ]}
                value={orderType}
                onChange={setOrderType}
              />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <label htmlFor="coown-units" className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
                Units
              </label>
              {side === 'sell' && holdingUnits > 0 ? (
                <div className="flex items-center gap-1.5">
                  {[0.25, 0.5, 0.75, 1].map((frac) => (
                    <button
                      key={frac}
                      type="button"
                      onClick={() => setUnitsText(String(Math.max(1, Math.floor(holdingUnits * frac))))}
                      className="pressable rounded border border-border-subtle bg-surface-alt px-1.5 py-0.5 text-[11px] font-semibold text-text-secondary hover:border-border hover:text-text-primary"
                    >
                      {frac === 1 ? 'Max' : `${frac * 100}%`}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                aria-label="One unit fewer"
                onClick={() => bump(-1)}
                className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-surface-alt text-text-primary hover:bg-surface-raised"
              >
                <Icon name="remove" size={18} />
              </button>
              <input
                id="coown-units"
                type="number"
                inputMode="numeric"
                min={1}
                max={maxOrderUnits}
                step={1}
                value={unitsText}
                onChange={(e) =>
                  setUnitsText(
                    e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''),
                  )
                }
                className="h-11 w-full rounded-lg bg-input px-3 text-center text-body-emphasis text-input-text tnum outline-none focus:ring-2 focus:ring-text-primary"
              />
              <button
                type="button"
                aria-label="One unit more"
                onClick={() => bump(1)}
                className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-surface-alt text-text-primary hover:bg-surface-raised"
              >
                <Icon name="plus" size={18} />
              </button>
            </div>
            {side === 'sell' && holdingUnits > 0 && (
              <p className="mt-1.5 text-meta text-text-muted tnum">
                {holdingUnits} {holdingUnits === 1 ? 'unit' : 'units'} held
              </p>
            )}
          </div>

          {orderType === 'limit' && (
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <label htmlFor="coown-limit" className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
                  Limit price
                </label>
                {(side === 'buy' ? bestAsk : bestBid) != null && (
                  <button
                    type="button"
                    onClick={() => {
                      const ref = side === 'buy' ? bestAsk : bestBid;
                      if (ref != null) {
                        setLimitText(ref.toFixed(2));
                        setLimitTouched(true);
                      }
                    }}
                    className="pressable text-meta font-semibold text-brand hover:underline"
                  >
                    Use {side === 'buy' ? 'Ask' : 'Bid'} ({gbp(side === 'buy' ? bestAsk! : bestBid!)})
                  </button>
                )}
              </div>
              <input
                id="coown-limit"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.5}
                value={limitText}
                onChange={(e) => {
                  setLimitText(e.target.value);
                  setLimitTouched(true);
                }}
                className="mt-2 h-11 w-full rounded-lg bg-input px-3 text-body-emphasis text-input-text tnum outline-none focus:ring-2 focus:ring-text-primary"
                placeholder={side === 'buy' ? 'Best ask' : 'Best bid'}
              />
            </div>
          )}

          {orderType === 'limit' && (
            <fieldset className="mt-4">
              <legend className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
                Time in force
              </legend>
              <div className="mt-2" role="group" aria-label="Time in force">
                <SegmentedControl
                  options={[
                    { value: 'gtc' as const, label: 'GTC · 90 days' },
                    { value: 'day' as const, label: 'Day order' },
                  ]}
                  value={duration}
                  onChange={setDuration}
                />
              </div>
            </fieldset>
          )}

          <TradeQuoteCard quote={quote} />

          {side === 'buy' && wallet?.ize && (
            <p className="mt-2 flex items-baseline justify-between text-meta text-text-muted">
              <span>1ZE available</span>
              <span className="tnum">{formatIze(izeAvailable ?? 0)} 1ZE</span>
            </p>
          )}

          <Button type="submit" size="lg" fullWidth disabled={!canSubmit || submitting || preparing} className="mt-4">
            {isGuest
              ? 'Sign in to trade'
              : preparing
                ? 'Getting a quote…'
                : `Review ${SIDE_LABEL[side].toLowerCase()} order`}
          </Button>
          {!canSubmit && reason && (
            <p className="mt-2 text-meta text-text-muted" role="status">
              {reason}{' '}
              {DATA_MODE !== 'live' &&
              side === 'buy' &&
              izeAvailable != null &&
              requiredIze > izeAvailable ? (
                <Link href="/wallet/convert" className="font-medium text-text-primary underline underline-offset-4">
                  Convert GBP
                </Link>
              ) : null}
            </p>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-caption text-text-muted">
            <Icon name="info" size={13} className="mt-px shrink-0" />
            Orders settle in 1ZE — buyer funds are held in escrow until the
            trade settles, and seller proceeds release after settlement.
          </p>
        </form>
      )}
      {wall}
    </div>
  );
}
