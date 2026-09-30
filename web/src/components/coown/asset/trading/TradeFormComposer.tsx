import Link from 'next/link';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type {
  CoOwnAsset,
  OrderDuration,
  OrderType,
  TradeSide,
} from '@/lib/contracts/coown';
import { DATA_MODE } from '@/lib/api/client';
import { formatIze } from '@/components/wallet/convertViewModel';
import { gbp } from '../../format';
import { TradeQuoteCard, type QuoteDisplay } from './TradeQuoteCard';

const SIDE_LABEL = { buy: 'Buy', sell: 'Sell' } as const;

interface TradeFormComposerProps {
  asset: CoOwnAsset;
  held: boolean;
  side: TradeSide;
  setSide: (side: TradeSide) => void;
  canBuy: boolean;
  canSell: boolean;
  orderType: OrderType;
  setOrderType: (type: OrderType) => void;
  unitsText: string;
  setUnitsText: (text: string) => void;
  maxOrderUnits: number;
  holdingUnits: number;
  bump: (delta: number) => void;
  limitText: string;
  setLimitText: (text: string) => void;
  setLimitTouched: (touched: boolean) => void;
  bestAsk: number | null;
  bestBid: number | null;
  duration: OrderDuration;
  setDuration: (duration: OrderDuration) => void;
  quote: QuoteDisplay;
  izeAvailable: number | null;
  requiredIze: number;
  canSubmit: boolean;
  submitting: boolean;
  preparing: boolean;
  isGuest: boolean;
  walletIzePresent: boolean;
  reason: string | null;
  onSubmit: (e: React.FormEvent) => void;
}

export function TradeFormComposer({
  asset,
  held,
  side,
  setSide,
  canBuy,
  canSell,
  orderType,
  setOrderType,
  unitsText,
  setUnitsText,
  maxOrderUnits,
  holdingUnits,
  bump,
  limitText,
  setLimitText,
  setLimitTouched,
  bestAsk,
  bestBid,
  duration,
  setDuration,
  quote,
  izeAvailable,
  requiredIze,
  canSubmit,
  submitting,
  preparing,
  isGuest,
  walletIzePresent,
  reason,
  onSubmit,
}: TradeFormComposerProps) {
  return (
    <form onSubmit={onSubmit} className={held ? 'mt-4' : ''} aria-label={`Trade ${asset.title}`}>
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
              // Whole units only — drop non-digits and leading zeros
              // rather than letting '2.5' quote as 3.
              setUnitsText(
                e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''),
              )
            }
            className="tnum h-11 w-full rounded-lg bg-input px-3 text-center text-body-emphasis text-input-text outline-none focus:ring-2 focus:ring-text-primary"
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
          <p className="tnum mt-1.5 text-meta text-text-muted">
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
            className="tnum mt-2 h-11 w-full rounded-lg bg-input px-3 text-body-emphasis text-input-text outline-none focus:ring-2 focus:ring-text-primary"
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

      {side === 'buy' && walletIzePresent && (
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

      {/* Settlement disclosure — funds sit in escrow until the order
          settles; the market itself is issuer-run, not an exchange. */}
      <p className="mt-3 flex items-start gap-1.5 text-caption text-text-muted">
        <Icon name="info" size={13} className="mt-px shrink-0" />
        Orders settle in 1ZE — buyer funds are held in escrow until the
        trade settles, and seller proceeds release after settlement.
      </p>
    </form>
  );
}
