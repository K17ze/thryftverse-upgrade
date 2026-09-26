'use client';

/**
 * TradePanel — the composer. Side + order type + units + limit price, a live
 * quote from buildTradeQuote, submit gated by evaluateTradeSubmit, and a
 * receipt view after placement. Also exports PausedNotice for halted markets.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import {
  CO_OWN_MAX_UNITS,
  buildTradeQuote,
  evaluateTradeSubmit,
} from '@/lib/utils/trade';
import type {
  CoOwnAsset,
  CoOwnOrder,
  OrderBookLevel,
  OrderType,
  TradeQuote,
  TradeSide,
} from '@/lib/contracts/coown';
import { gbp, signedGbp, signedPct } from '../format';

const SIDE_LABEL = { buy: 'Buy', sell: 'Sell' } as const;
const TYPE_LABEL = { market: 'Market', limit: 'Limit', protected_market: 'Protected' } as const;

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
  onPlaced,
  prefill,
}: {
  asset: CoOwnAsset;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  position: { units: number; avgEntryPriceGbp: number } | null;
  onPlaced?: (order: CoOwnOrder) => void;
  prefill?: TradePrefill | null;
}) {
  const [side, setSide] = useState<TradeSide>('buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [unitsText, setUnitsText] = useState('1');
  const [limitText, setLimitText] = useState('');
  const [limitTouched, setLimitTouched] = useState(false);
  const [receipt, setReceipt] = useState<TradeQuote | null>(null);
  const appliedSeq = useRef(-1);

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

  const quote = useMemo(
    () =>
      buildTradeQuote({
        side,
        orderType,
        units,
        limitPriceGbp,
        bids,
        asks,
      }),
    [side, orderType, units, limitPriceGbp, bids, asks],
  );

  const gate = evaluateTradeSubmit({ units, orderType, limitPriceGbp, quote });
  const noLiquidity = quote.estimate == null && orderType !== 'limit';
  const canSubmit = gate.enabled && !noLiquidity;
  const reason = noLiquidity ? 'No orders on the book yet' : gate.reason;

  const bump = (delta: number) =>
    setUnitsText(String(Math.min(CO_OWN_MAX_UNITS, Math.max(1, units + delta))));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !quote) return;
    if (orderType === 'limit' && limitPriceGbp != null) {
      onPlaced?.({
        id: `local-${Date.now()}`,
        assetId: asset.id,
        side,
        orderType,
        unitPriceGbp: limitPriceGbp,
        units,
        filledUnits: 0,
        status: 'open',
        feeGbp: quote.feeGbp,
        totalGbp: quote.totalGbp,
        placedAt: new Date().toISOString(),
      });
    }
    setReceipt(quote);
  };

  const marketValue = position ? position.units * asset.unitPriceGbp : 0;
  const unrealised = position
    ? (asset.unitPriceGbp - position.avgEntryPriceGbp) * position.units
    : 0;
  const unrealisedPct = position && position.avgEntryPriceGbp > 0
    ? (asset.unitPriceGbp / position.avgEntryPriceGbp - 1) * 100
    : null;

  return (
    <div>
      {position ? (
        <div className="border-b border-border-subtle pb-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
              Your position
            </h3>
            <span className="text-body-emphasis font-semibold text-text-primary tnum">
              {position.units} {position.units === 1 ? 'unit' : 'units'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between text-meta text-text-secondary tnum">
            <span>
              Avg entry {gbp(position.avgEntryPriceGbp)} · Value {gbp(marketValue)}
            </span>
            <span className={`font-semibold ${unrealised >= 0 ? 'text-coown-up' : 'text-coown-down'}`}>
              {signedGbp(unrealised)} ({signedPct(unrealisedPct)})
            </span>
          </div>
        </div>
      ) : null}

      {receipt ? (
        <ReceiptView quote={receipt} onDone={() => setReceipt(null)} />
      ) : (
        <form onSubmit={submit} className={position ? 'mt-4' : ''} aria-label={`Trade ${asset.title}`}>
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

          <QuoteCard quote={quote} />

          <Button type="submit" size="lg" fullWidth disabled={!canSubmit} className="mt-4">
            {SIDE_LABEL[side]} {units || 0} {units === 1 ? 'unit' : 'units'}
          </Button>
          {!canSubmit && reason ? (
            <p className="mt-2 text-meta text-text-muted" role="status">
              {reason}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}

function QuoteCard({ quote }: { quote: TradeQuote }) {
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

function ReceiptView({ quote, onDone }: { quote: TradeQuote; onDone: () => void }) {
  const est = quote.estimate;
  return (
    <div role="status" className="mt-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-subtle text-success-text">
          <Icon name="check" filled size={20} />
        </span>
        <div>
          <p className="text-body-emphasis font-semibold text-text-primary">Order placed</p>
          <p className="text-meta text-text-secondary">
            {SIDE_LABEL[quote.side]} · {TYPE_LABEL[quote.orderType]}
          </p>
        </div>
      </div>
      <dl className="mt-4 space-y-2 border-t border-border-subtle pt-4 text-body">
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">Units</dt>
          <dd className="text-text-primary tnum">{quote.units}</dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">{est ? 'Avg fill' : 'Limit price'}</dt>
          <dd className="text-text-primary tnum">
            {gbp(est ? est.avgFillPriceGbp : quote.orderPriceGbp)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-text-secondary">Fee</dt>
          <dd className="text-text-primary tnum">{gbp(quote.feeGbp)}</dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-border-subtle pt-2.5">
          <dt className="text-body-emphasis font-semibold text-text-primary">Total</dt>
          <dd className="text-body-emphasis font-semibold text-text-primary tnum">
            {gbp(quote.totalGbp)}
          </dd>
        </div>
      </dl>
      <Button variant="secondary" fullWidth className="mt-5" onClick={onDone}>
        Done
      </Button>
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
