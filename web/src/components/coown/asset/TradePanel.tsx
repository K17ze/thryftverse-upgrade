'use client';

/**
 * TradePanel — the composer. Side + order type + units + limit price, a
 * live execution plan from planExecution, and a submit gated by the real
 * ledger constraints: guests get the signup wall, sells can't exceed the
 * position, buys need enough 1ZE to cover the fill plus the resting
 * reserve. Confirming routes through usePlaceCoOwnOrder, so the receipt
 * only ever reports what the shared caches actually recorded.
 * Also exports PausedNotice for halted markets.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import { CO_OWN_MAX_UNITS } from '@/lib/utils/trade';
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

const SIDE_LABEL = { buy: 'Buy', sell: 'Sell' } as const;
const TYPE_LABEL = { market: 'Market', limit: 'Limit', protected_market: 'Protected' } as const;
/** Time-in-force — 'day' rests until end of day (GFD on the wire),
 *  'gtc' rests until cancelled or 90 days (GTC90). */
const DURATION_LABEL: Record<OrderDuration, string> = {
  day: 'Day order',
  gtc: 'GTC · 90 days',
};

export interface TradePrefill {
  price: number;
  side: TradeSide;
  seq: number;
}

interface QuoteDisplay {
  side: TradeSide;
  orderType: OrderType;
  /** Null when nothing on the book crosses the order. */
  estimate: {
    filledUnits: number;
    avgFillPriceGbp: number;
    worstPriceGbp: number;
  } | null;
  restingUnits: number;
  grossNotionalGbp: number;
  feeGbp: number;
  totalGbp: number;
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
  // Server advisory verdict — live mode only; the backend re-checks
  // transactionally at order time, so this only shapes the disabled UI.
  const { data: eligibility } = useCoOwnEligibility(asset.id);
  // The versioned server caps — the composer enforces the same
  // maxOrderUnits the ingest schema will, not a local constant.
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
  // Live mode: the review step runs on a real reservation — the server
  // preview + the held funds/units. Null in fixture mode (no reservation).
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<PreparedLiveOrder | null>(null);
  // Ref mirror so unmount/back cleanup can release the live reservation.
  const preparedRef = useRef<PreparedLiveOrder | null>(null);
  const [receipt, setReceipt] = useState<PlaceOrderResult | null>(null);
  // Risk-disclosure acceptance is a server-side consent record — ticked
  // on the review step, then recorded before the order writes.
  const [riskAccepted, setRiskAccepted] = useState(false);
  const appliedSeq = useRef(-1);
  // One idempotency key per confirm attempt — minted when the review
  // sheet opens and reused across retries so an ambiguous failure
  // replays server-side instead of double-placing a 1ZE order.
  const attemptKey = useRef<string | null>(null);

  const bestAsk = asks[0]?.unitPriceGbp ?? null;
  const bestBid = bids[0]?.unitPriceGbp ?? null;

  // Server-computed market capabilities (list/detail wire) — where they
  // exist they gate the side picker early (pre_market takes buys but no
  // sells). Absent capabilities gate nothing: lifecycle state already
  // covers paused/closed upstream, and the endpoints re-check anyway.
  const canBuy = asset.capabilities?.buy !== false;
  const canSell = asset.capabilities?.sell !== false;

  // Coerce the side back to something the market accepts — e.g. a sell
  // prefill that arrived before a pre_market capabilities read landed.
  useEffect(() => {
    if (side === 'sell' && !canSell && canBuy) setSide('buy');
    else if (side === 'buy' && !canBuy && canSell) setSide('sell');
  }, [side, canBuy, canSell]);

  // Book-row picks land here: switch to limit and prefill the price.
  useEffect(() => {
    if (!prefill || prefill.seq === appliedSeq.current) return;
    appliedSeq.current = prefill.seq;
    setSide(prefill.side);
    setOrderType('limit');
    setLimitText(prefill.price.toFixed(2));
    setLimitTouched(true);
  }, [prefill]);

  // Limit mode prefills the touchline until the user edits it.
  useEffect(() => {
    if (orderType !== 'limit' || limitTouched) return;
    const ref = side === 'buy' ? bestAsk : bestBid;
    if (ref != null) setLimitText(ref.toFixed(2));
  }, [orderType, side, bestAsk, bestBid, limitTouched]);

  const units = Math.min(maxOrderUnits, Math.max(0, Math.round(Number(unitsText)) || 0));
  const limitPriceGbp =
    orderType === 'limit' && Number(limitText) > 0 ? Number(limitText) : null;

  // Live buys can also draw the primary pool — the issuer's unsold units
  // settle at the reference price when the protection bound reaches it
  // (backend preview/matcher apply the same rule). Fold it into the asks
  // the local plan walks so the gate and the wire bound don't refuse a
  // fill the server would satisfy from issuance.
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

  // The quote card shows the full-order obligation: fills at book prices
  // plus the resting remainder at the limit.
  const quote = useMemo<QuoteDisplay>(() => {
    const restingGross = plan.restingUnits * (limitPriceGbp ?? 0);
    const gross = round2(plan.fillGrossGbp + restingGross);
    const fee = round2(gross * 0.01);
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
      totalGbp: side === 'buy' ? round2(gross + fee) : round2(gross - fee),
    };
  }, [plan, limitPriceGbp, side, orderType]);

  // ── Submit gate — every reason is a real ledger constraint ──────────
  const holdingUnits = position?.units ?? 0;
  // Null while the wallet is loading OR when the 1ZE pocket couldn't be
  // read in live mode — an absent pocket never gates as a zero balance.
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
    // Server advisory verdict — the authoritative check still runs
    // inside the placement transaction; this only gates the UI early.
    reason = eligibility.reason ?? "This order isn't available for your account";
  } else if (isGuest) {
    // Guests can always reach the signup wall — ledger gates run after auth.
    canSubmit = true;
  } else if (!wallet) {
    // Both sides settle in 1ZE — the pocket has to be loaded to price the gate.
    reason = 'Checking your 1ZE balance…';
  } else if (side === 'buy' && wallet.ize == null) {
    // Live mode: the position endpoint failed or isn't deployed. Refuse the
    // buy rather than gate on a fabricated balance — the user can retry.
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

  // Hold-to-submit policy (mobile TradeConfirm grammar): orders above
  // 5,000 1ZE notional or above 5% of the asset's unit float get a
  // press-and-hold commit, not a tap. The reason names the check that
  // actually fired — never a generic label.
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

  /** Release a live reservation without consuming it (back, expiry,
   *  unmount). A 404 just means the server already released/expired it. */
  const releasePrepared = () => {
    const p = preparedRef.current;
    preparedRef.current = null;
    setPrepared(null);
    if (p) {
      void coownService.releaseCoOwnReservation(asset.id, p.reservation.id).catch(() => {});
    }
  };

  // If the panel unmounts mid-review, don't leave the 60s hold stranded.
  useEffect(
    () => () => {
      const p = preparedRef.current;
      if (p) {
        void coownService.releaseCoOwnReservation(asset.id, p.reservation.id).catch(() => {});
      }
    },
    [asset.id],
  );

  // Step one — the compose form asks for review. Auth runs here so a
  // guest hits the signup wall before the review step, not after it.
  // Live mode then runs preview → reserve up front: the review shows the
  // server's quote and a real commit deadline, not a local estimate.
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
      // Verbatim server refusal (eligibility, validation, balance).
      show(err instanceof Error ? err.message : 'Could not prepare this order', 'error');
    } finally {
      setPreparing(false);
    }
  };

  // Risk disclosure — an unaccepted live document gates the confirm,
  // not the compose form (the checkbox lives on the review step).
  const riskDoc = riskDisclosure?.document ?? null;
  const riskNeeded =
    DATA_MODE === 'live' && riskDoc != null && riskDisclosure?.accepted === false;

  // Step two — review confirmed; the write path settles the order.
  const confirm = async () => {
    if (submitting || (riskNeeded && !riskAccepted)) return;
    setSubmitting(true);
    try {
      if (riskNeeded && riskDoc && user) {
        // Record consent first — the order only proceeds when the
        // disclosure acceptance is persisted server-side.
        await coownService.acceptRiskDisclosure(user.id, riskDoc.id, {
          assetId: asset.id,
          surface: 'coown_trade_review',
        });
        // Consent is a RISK_DISCLOSURE gate input — drop both caches so
        // the advisory verdict and the review step reflect acceptance.
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
      // The reservation was consumed by the commit — drop the handle.
      preparedRef.current = null;
      setPrepared(null);
      setReceipt(result);
    } catch (err) {
      // Surface the server's refusal verbatim — no receipt, nothing
      // recorded. If the hold meanwhile lapsed, drop it so a retry
      // re-reserves instead of committing against an expired reservation.
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

  // The review's reservation lapsed — the hold is gone server-side, so
  // drop back to the composer where a fresh review re-reserves.
  const onReservationExpired = () => {
    releasePrepared();
    setReviewing(false);
    show('That quote expired — review the order again', 'info');
  };

  // A fully-closed position (0 units left after a sell) is not a holding
  // — the row only renders while units remain.
  const held = position && position.units > 0 ? position : null;
  // Position worth marks at the last settled trade once the market has
  // printed — not the issuance price.
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
      {held ? (
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
      ) : null}

      {receipt ? (
        <ReceiptView
          result={receipt}
          onDone={() => {
            setReceipt(null);
            setReviewing(false);
          }}
        />
      ) : reviewing ? (
        <ReviewCard
          asset={asset}
          side={side}
          orderType={orderType}
          units={units}
          limitPriceGbp={limitPriceGbp}
          duration={duration}
          quote={quote}
          prepared={prepared}
          onExpire={onReservationExpired}
          maxReservedLabel={
            prepared
              ? // Server-quoted hold — the real reserved figure.
                prepared.reservation.side === 'buy'
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
            <label htmlFor="coown-units" className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
              Units
            </label>
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
                onChange={(e) => setUnitsText(e.target.value)}
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
            {side === 'sell' && holdingUnits > 0 ? (
              <p className="mt-1.5 text-meta text-text-muted tnum">
                {holdingUnits} {holdingUnits === 1 ? 'unit' : 'units'} held
              </p>
            ) : null}
          </div>

          {orderType === 'limit' ? (
            <div className="mt-4">
              <label htmlFor="coown-limit" className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
                Limit price
              </label>
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
          ) : null}

          {orderType === 'limit' ? (
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
          ) : null}

          <QuoteCard quote={quote} />

          {side === 'buy' && wallet?.ize ? (
            <p className="mt-2 flex items-baseline justify-between text-meta text-text-muted">
              <span>1ZE available</span>
              <span className="tnum">{formatIze(izeAvailable ?? 0)} 1ZE</span>
            </p>
          ) : null}

          <Button type="submit" size="lg" fullWidth disabled={!canSubmit || submitting || preparing} className="mt-4">
            {isGuest
              ? 'Sign in to trade'
              : preparing
                ? 'Getting a quote…'
                : `Review ${SIDE_LABEL[side].toLowerCase()} order`}
          </Button>
          {!canSubmit && reason ? (
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
          ) : null}
          {/* Settlement disclosure — funds sit in escrow until the order
              settles; the market itself is issuer-run, not an exchange. */}
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

function QuoteCard({ quote }: { quote: QuoteDisplay }) {
  const est = quote.estimate;
  return (
    <dl className="mt-5 space-y-2 border-t border-border-subtle pt-4 text-body">
      {est ? (
        <>
          <div className="flex items-baseline justify-between">
            <dt className="text-text-secondary">Est. fill</dt>
            <dd className="text-text-primary tnum">
              {est.filledUnits} units @ {gbp(est.avgFillPriceGbp)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-text-secondary">Worst price</dt>
            <dd className="text-text-primary tnum">{gbp(est.worstPriceGbp)}</dd>
          </div>
        </>
      ) : quote.orderType === 'limit' ? (
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">Resting</dt>
          <dd className="text-text-primary">Waits for a match on the book</dd>
        </div>
      ) : null}
      {quote.restingUnits > 0 && est ? (
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">Resting</dt>
          <dd className="text-text-primary tnum">{quote.restingUnits} units on the book</dd>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between">
        <dt className="text-text-secondary">Gross</dt>
        <dd className="text-text-primary tnum">{gbp(quote.grossNotionalGbp)}</dd>
      </div>
      <div className="flex items-baseline justify-between">
        <dt className="text-text-secondary">Fee (1%)</dt>
        <dd className="text-text-primary tnum">{gbp(quote.feeGbp)}</dd>
      </div>
      <div className="flex items-baseline justify-between border-t border-border-subtle pt-2.5">
        <dt className="text-body-emphasis font-semibold text-text-primary">Total</dt>
        <dd className="text-body-emphasis font-semibold text-text-primary tnum" aria-live="polite">
          {gbp(quote.totalGbp)}
        </dd>
      </div>
    </dl>
  );
}

/**
 * Review step — the order as it will be written, with the full quote and
 * the maximum obligation (mobile's "max reserved"), before the ledger is
 * touched. Above the hold thresholds the commit is a press-and-hold —
 * the only money-moving action.
 */
/** Wall-clock ticker for the reservation countdown — 1s resolution is
 *  enough for a ~60s hold. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function ReviewCard({
  asset,
  side,
  orderType,
  units,
  limitPriceGbp,
  duration,
  quote,
  prepared,
  onExpire,
  maxReservedLabel,
  requireHold,
  holdReason,
  submitting,
  riskDocument,
  riskAccepted,
  onRiskAcceptedChange,
  onBack,
  onConfirm,
}: {
  asset: CoOwnAsset;
  side: TradeSide;
  orderType: OrderType;
  units: number;
  limitPriceGbp: number | null;
  duration: OrderDuration;
  quote: QuoteDisplay;
  /** Live mode: the server preview + reservation this review is bound
   *  to. Null in fixture mode, where the local quote is the display. */
  prepared: PreparedLiveOrder | null;
  /** Fired once when the reservation's commit deadline passes. */
  onExpire: () => void;
  /** Full obligation — 1ZE locked for buys, units committed for sells. */
  maxReservedLabel: string;
  requireHold: boolean;
  holdReason: string;
  submitting: boolean;
  /** Non-null when the live risk disclosure hasn't been accepted yet —
   *  the confirm stays disabled until the checkbox is ticked. */
  riskDocument: { id: string; version: string; title: string; contentUrl: string | null } | null;
  riskAccepted: boolean;
  onRiskAcceptedChange: (accepted: boolean) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  // Countdown to the real commit deadline — the earlier of the preview's
  // validity and the reservation expiry.
  const now = useNow(prepared != null);
  const secondsLeft =
    prepared != null ? Math.max(0, Math.ceil((prepared.validUntilMs - now) / 1000)) : null;
  const expired = secondsLeft === 0;
  const expireFired = useRef(false);
  useEffect(() => {
    if (expired && !expireFired.current) {
      expireFired.current = true;
      onExpire();
    }
  }, [expired, onExpire]);

  return (
    <div className="mt-4">
      <h3 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
        Review order
      </h3>
      <dl className="mt-3 space-y-2 text-body">
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">Market</dt>
          <dd className="clamp-1 max-w-[60%] text-right font-medium text-text-primary">
            {asset.title}
          </dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">Side · type</dt>
          <dd className={`tnum font-semibold ${side === 'buy' ? 'text-coown-up' : 'text-coown-down'}`}>
            {SIDE_LABEL[side]} · {TYPE_LABEL[orderType]}
          </dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">Units</dt>
          <dd className="text-text-primary tnum">{units}</dd>
        </div>
        {orderType === 'limit' && limitPriceGbp != null ? (
          <>
            <div className="flex items-baseline justify-between">
              <dt className="text-text-secondary">Limit price</dt>
              <dd className="text-text-primary tnum">{gbp(limitPriceGbp)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-text-secondary">Time in force</dt>
              <dd className="text-text-primary">{DURATION_LABEL[duration]}</dd>
            </div>
          </>
        ) : null}
      </dl>
      {prepared ? (
        // Server quote — the preview's own fill walk, fee and total.
        // Nothing here is computed locally.
        <dl className="mt-5 space-y-2 border-t border-border-subtle pt-4 text-body">
          {prepared.preview.estimatedFill.filledUnits > 0 ? (
            <>
              <div className="flex items-baseline justify-between">
                <dt className="text-text-secondary">Est. fill</dt>
                <dd className="text-text-primary tnum">
                  {prepared.preview.estimatedFill.filledUnits} units @{' '}
                  {gbp(prepared.preview.estimatedFill.avgFillPrice)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-text-secondary">Worst price</dt>
                <dd className="text-text-primary tnum">
                  {gbp(prepared.preview.estimatedFill.worstPrice)}
                </dd>
              </div>
            </>
          ) : null}
          {prepared.preview.estimatedFill.remainingUnits > 0 ? (
            <div className="flex items-baseline justify-between">
              <dt className="text-text-secondary">
                {prepared.preview.orderType === 'limit' ? 'Resting' : 'Beyond depth'}
              </dt>
              <dd className="text-text-primary tnum">
                {prepared.preview.orderType === 'limit'
                  ? `${prepared.preview.estimatedFill.remainingUnits} units on the book`
                  : `${prepared.preview.estimatedFill.remainingUnits} units won't fill`}
              </dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between">
            <dt className="text-text-secondary">
              Fee ({(prepared.preview.feeRate * 100).toFixed(0)}%)
            </dt>
            <dd className="text-text-primary tnum">{gbp(prepared.preview.fee)}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-border-subtle pt-2.5">
            <dt className="text-body-emphasis font-semibold text-text-primary">Total</dt>
            <dd
              className="text-body-emphasis font-semibold text-text-primary tnum"
              aria-live="polite"
            >
              {gbp(prepared.preview.total)}
            </dd>
          </div>
        </dl>
      ) : (
        <QuoteCard quote={quote} />
      )}
      <dl className="mt-3 space-y-2 text-body">
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">Max reserved</dt>
          <dd className="text-text-primary tnum">{maxReservedLabel}</dd>
        </div>
        {prepared ? (
          <div className="flex items-baseline justify-between">
            <dt className="text-text-secondary">Reserved for</dt>
            <dd
              className={`tnum ${
                secondsLeft != null && secondsLeft <= 15
                  ? 'font-semibold text-danger-text'
                  : 'text-text-primary'
              }`}
            >
              {secondsLeft != null
                ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
                : '—'}
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-3 flex items-start gap-1.5 text-caption text-text-muted">
        <Icon name="info" size={13} className="mt-px shrink-0" />
        Orders settle in 1ZE — buyer funds are held in escrow until the
        trade settles, and seller proceeds release after settlement.
      </p>
      {riskDocument ? (
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 border-t border-border-subtle pt-4">
          <input
            type="checkbox"
            checked={riskAccepted}
            onChange={(e) => onRiskAcceptedChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
          />
          <span className="text-meta text-text-secondary">
            I&rsquo;ve read and accept the{' '}
            {riskDocument.contentUrl ? (
              <a
                href={riskDocument.contentUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-text-primary underline underline-offset-4"
              >
                {riskDocument.title} (v{riskDocument.version})
              </a>
            ) : (
              `${riskDocument.title} (v${riskDocument.version})`
            )}
            . Fractional ownership can lose value and liquidity is not guaranteed.
          </span>
        </label>
      ) : null}
      <div className="mt-5 flex flex-col gap-2">
        <HoldToConfirmButton
          requireHold={requireHold}
          disabled={
            submitting ||
            expired ||
            (DATA_MODE === 'live' && prepared == null) ||
            (riskDocument != null && !riskAccepted)
          }
          onSubmit={onConfirm}
          label={
            submitting
              ? 'Placing order…'
              : `Confirm ${SIDE_LABEL[side].toLowerCase()} ${units} ${units === 1 ? 'unit' : 'units'}`
          }
          holdLabel={submitting ? 'Placing order…' : 'Press and hold to confirm'}
        />
        {requireHold && !submitting ? (
          <p className="text-center text-meta text-text-muted">{holdReason}</p>
        ) : null}
        <Button variant="secondary" size="md" fullWidth onClick={onBack} disabled={submitting}>
          Back to edit
        </Button>
      </div>
    </div>
  );
}

const HOLD_MS = 600;

/**
 * Press-and-hold commit — the web port of mobile HoldToSubmitButton.
 * Above the notional/float thresholds a tap isn't enough: pointer down
 * fills the track over 600ms and submits on completion. Keyboard users
 * and reduced-motion sessions keep the plain click path — the hold is a
 * commitment device, not an accessibility barrier.
 */
function HoldToConfirmButton({
  requireHold,
  disabled,
  onSubmit,
  label,
  holdLabel,
}: {
  requireHold: boolean;
  disabled?: boolean;
  onSubmit: () => void;
  label: string;
  holdLabel: string;
}) {
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);
  const startAt = useRef(0);

  const cancel = () => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setProgress(0);
  };

  useEffect(() => cancel, []);

  if (!requireHold) {
    return (
      <Button size="lg" fullWidth onClick={onSubmit} disabled={disabled}>
        {label}
      </Button>
    );
  }

  const tickProgress = () => {
    const t = (performance.now() - startAt.current) / HOLD_MS;
    if (t >= 1) {
      frame.current = null;
      setProgress(0);
      onSubmit();
      return;
    }
    setProgress(t);
    frame.current = requestAnimationFrame(tickProgress);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`${holdLabel} — ${label}`}
      onPointerDown={(e) => {
        if (disabled || e.pointerType === 'mouse' && e.button !== 0) return;
        startAt.current = performance.now();
        frame.current = requestAnimationFrame(tickProgress);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      // Keyboard-only submit — pointer clicks already resolved via the
      // hold path; detail === 0 means a keyboard (or AT) activation.
      onClick={(e) => {
        if (e.detail === 0) onSubmit();
      }}
      className="pressable relative h-[52px] w-full overflow-hidden rounded-md bg-brand text-body-emphasis font-semibold text-text-inverse disabled:opacity-40"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-scrim-text-primary/20"
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative">{progress > 0 ? 'Keep holding…' : holdLabel}</span>
    </button>
  );
}

function ReceiptView({ result, onDone }: { result: PlaceOrderResult; onDone: () => void }) {
  const { order, plan } = result;
  const est = plan && plan.filledUnits > 0 ? plan : null;
  const resting = plan?.restingUnits ?? 0;

  const headline =
    order.status === 'filled'
      ? 'Order filled'
      : order.status === 'partially_filled'
        ? 'Partially filled'
        : 'Order resting';
  const subline =
    order.status === 'open'
      ? `${SIDE_LABEL[order.side]} · ${TYPE_LABEL[order.orderType]} — waiting on the book`
      : `${SIDE_LABEL[order.side]} · ${TYPE_LABEL[order.orderType]}`;

  return (
    <div role="status" className="mt-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-subtle text-success-text">
          <Icon name={order.status === 'open' ? 'clock' : 'check'} filled size={20} />
        </span>
        <div>
          <p className="text-body-emphasis font-semibold text-text-primary">{headline}</p>
          <p className="text-meta text-text-secondary">{subline}</p>
        </div>
      </div>
      <dl className="mt-4 space-y-2 border-t border-border-subtle pt-4 text-body">
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">Units</dt>
          <dd className="text-text-primary tnum">
            {est ? `${order.filledUnits} filled of ${order.units}` : order.units}
          </dd>
        </div>
        {est ? (
          <div className="flex items-baseline justify-between">
            <dt className="text-text-secondary">Avg fill</dt>
            <dd className="text-text-primary tnum">{gbp(est.avgFillPriceGbp)}</dd>
          </div>
        ) : (
          <div className="flex items-baseline justify-between">
            <dt className="text-text-secondary">Limit price</dt>
            <dd className="text-text-primary tnum">{gbp(order.unitPriceGbp)}</dd>
          </div>
        )}
        {resting > 0 ? (
          <div className="flex items-baseline justify-between">
            <dt className="text-text-secondary">Resting</dt>
            <dd className="text-text-primary tnum">
              {resting} {resting === 1 ? 'unit' : 'units'} @ {gbp(order.unitPriceGbp)}
            </dd>
          </div>
        ) : null}
        {order.duration ? (
          <div className="flex items-baseline justify-between">
            <dt className="text-text-secondary">Time in force</dt>
            <dd className="text-text-primary">{DURATION_LABEL[order.duration]}</dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">Fee</dt>
          <dd className="text-text-primary tnum">{gbp(order.feeGbp)}</dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-border-subtle pt-2.5">
          <dt className="text-body-emphasis font-semibold text-text-primary">Total</dt>
          <dd className="text-body-emphasis font-semibold text-text-primary tnum">
            {gbp(order.totalGbp)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">Reference</dt>
          <dd className="text-meta text-text-muted tnum">{order.id.toUpperCase().slice(0, 18)}</dd>
        </div>
      </dl>
      {order.status !== 'filled' ? (
        <p className="mt-3 text-meta text-text-muted">
          Open orders live under Portfolio — cancelling releases the remainder.
        </p>
      ) : null}
      <div className="mt-5 flex flex-col items-center gap-3">
        <Button variant="secondary" fullWidth onClick={onDone}>
          Done
        </Button>
        {order.status !== 'filled' ? (
          <Link
            href="/co-own/portfolio"
            className="pressable text-caption font-semibold text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            View open orders in portfolio
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function PausedNotice({ exitUnderway }: { exitUnderway: boolean }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-warning-border bg-warning-subtle p-4"
    >
      <div className="flex items-center gap-2">
        <Icon name="pause" size={18} className="text-warning-text" />
        <p className="text-body-emphasis font-semibold text-warning-text">
          {exitUnderway ? 'Exit underway' : 'Trading paused'}
        </p>
      </div>
      <p className="mt-2 text-body text-text-secondary">
        {exitUnderway
          ? 'This asset is exiting. Units redeem from the sale proceeds — no further trades.'
          : 'Orders are paused on this market. Your position and resting orders are unaffected.'}
      </p>
    </div>
  );
}
