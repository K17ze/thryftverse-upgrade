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
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
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
  const { isGuest } = useSession();
  const { requireAuth, wall } = useSignupWall();
  const { data: wallet } = useWalletData();
  const { placeOrder } = usePlaceCoOwnOrder();
  const { show } = useToast();

  const [side, setSide] = useState<TradeSide>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [unitsText, setUnitsText] = useState('1');
  const [limitText, setLimitText] = useState('');
  const [limitTouched, setLimitTouched] = useState(false);
  const [duration, setDuration] = useState<OrderDuration>('gtc');
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<PlaceOrderResult | null>(null);
  const appliedSeq = useRef(-1);
  // One idempotency key per confirm attempt — minted when the review
  // sheet opens and reused across retries so an ambiguous failure
  // replays server-side instead of double-placing a 1ZE order.
  const attemptKey = useRef<string | null>(null);

  const bestAsk = asks[0]?.unitPriceGbp ?? null;
  const bestBid = bids[0]?.unitPriceGbp ?? null;

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

  const units = Math.min(CO_OWN_MAX_UNITS, Math.max(0, Math.round(Number(unitsText)) || 0));
  const limitPriceGbp =
    orderType === 'limit' && Number(limitText) > 0 ? Number(limitText) : null;

  const plan = useMemo<ExecutionPlan>(
    () =>
      planExecution({
        side,
        orderType,
        units,
        limitPriceGbp,
        bids,
        asks,
      }),
    [side, orderType, units, limitPriceGbp, bids, asks],
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
  } else if (units > CO_OWN_MAX_UNITS) {
    reason = `Maximum ${CO_OWN_MAX_UNITS} units per order`;
  } else if (orderType === 'limit' && (limitPriceGbp == null || limitPriceGbp <= 0)) {
    reason = 'Set a limit price';
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
    setUnitsText(String(Math.min(CO_OWN_MAX_UNITS, Math.max(1, units + delta))));

  // Step one — the compose form asks for review. Auth runs here so a
  // guest hits the signup wall before the review step, not after it.
  const openReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    if (!requireAuth('purchase')) return;
    attemptKey.current = `web-coown-${crypto.randomUUID()}`;
    setReviewing(true);
  };

  // Step two — review confirmed; the write path settles the order.
  const confirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await placeOrder({
        asset,
        side,
        orderType,
        units,
        limitPriceGbp,
        duration,
        bids,
        asks,
        idempotencyKey:
          attemptKey.current ?? `web-coown-${crypto.randomUUID()}`,
      });
      setReceipt(result);
    } catch {
      // The ledger refused the write — no receipt, nothing recorded.
      show(
        side === 'sell'
          ? 'Order refused — check your holdings and try again'
          : 'Order refused — check your 1ZE balance and try again',
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // A fully-closed position (0 units left after a sell) is not a holding
  // — the row only renders while units remain.
  const held = position && position.units > 0 ? position : null;
  const marketValue = held ? held.units * asset.unitPriceGbp : 0;
  const unrealised = held
    ? (asset.unitPriceGbp - held.avgEntryPriceGbp) * held.units
    : 0;
  const unrealisedPct = held && held.avgEntryPriceGbp > 0
    ? (asset.unitPriceGbp / held.avgEntryPriceGbp - 1) * 100
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
          maxReservedLabel={
            side === 'buy'
              ? `${formatIze(requiredIze)} 1ZE`
              : `${units} ${units === 1 ? 'unit' : 'units'}`
          }
          requireHold={requireHold}
          holdReason={holdReason}
          submitting={submitting}
          onBack={() => setReviewing(false)}
          onConfirm={confirm}
        />
      ) : (
        <form onSubmit={openReview} className={held ? 'mt-4' : ''} aria-label={`Trade ${asset.title}`}>
          <fieldset>
            <legend className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
              Side
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2" role="group">
              {(['buy', 'sell'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={side === s}
                  onClick={() => setSide(s)}
                  className={`pressable h-11 rounded-md border text-body-emphasis font-semibold ${
                    side === s
                      ? s === 'buy'
                        ? 'border-coown-up/40 bg-coown-up-subtle text-coown-up'
                        : 'border-coown-down/40 bg-coown-down-subtle text-coown-down'
                      : 'border-border-subtle text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {SIDE_LABEL[s]}
                </button>
              ))}
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
                max={CO_OWN_MAX_UNITS}
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

          <Button type="submit" size="lg" fullWidth disabled={!canSubmit || submitting} className="mt-4">
            {isGuest
              ? 'Sign in to trade'
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
function ReviewCard({
  asset,
  side,
  orderType,
  units,
  limitPriceGbp,
  duration,
  quote,
  maxReservedLabel,
  requireHold,
  holdReason,
  submitting,
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
  /** Full obligation — 1ZE locked for buys, units committed for sells. */
  maxReservedLabel: string;
  requireHold: boolean;
  holdReason: string;
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
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
      <QuoteCard quote={quote} />
      <dl className="mt-3 space-y-2 text-body">
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">Max reserved</dt>
          <dd className="text-text-primary tnum">{maxReservedLabel}</dd>
        </div>
      </dl>
      <p className="mt-3 flex items-start gap-1.5 text-caption text-text-muted">
        <Icon name="info" size={13} className="mt-px shrink-0" />
        Orders settle in 1ZE — buyer funds are held in escrow until the
        trade settles, and seller proceeds release after settlement.
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <HoldToConfirmButton
          requireHold={requireHold}
          disabled={submitting}
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
