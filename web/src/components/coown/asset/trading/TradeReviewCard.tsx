'use client';

/**
 * TradeReviewCard — pre-trade confirmation step with live reservation
 * countdown, market adverse movement notice, risk disclosure acceptance,
 * and press-and-hold commit for high-notional / large-float orders.
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { DATA_MODE } from '@/lib/api/client';
import type { CoOwnAsset, OrderDuration, OrderType, TradeSide } from '@/lib/contracts/coown';
import type { PreparedLiveOrder } from '@/components/trading/useCoOwnTrading';
import { TradeQuoteCard, type QuoteDisplay } from './TradeQuoteCard';
import { gbp } from '../../format';

const SIDE_LABEL: Record<TradeSide, string> = { buy: 'Buy', sell: 'Sell' };
const TYPE_LABEL: Record<OrderType, string> = { market: 'Market', limit: 'Limit', protected_market: 'Protected' };
const DURATION_LABEL: Record<OrderDuration, string> = {
  day: 'Day order',
  gtc: 'GTC · 90 days',
};

const HOLD_MS = 600;

/**
 * Press-and-hold commit — web port of mobile HoldToSubmitButton.
 * Above notional/float thresholds, pointer down fills track over 600ms
 * and submits on completion. Keyboard/reduced motion retains standard click.
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
        if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
        startAt.current = performance.now();
        frame.current = requestAnimationFrame(tickProgress);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
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

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export interface TradeReviewCardProps {
  asset: CoOwnAsset;
  side: TradeSide;
  orderType: OrderType;
  units: number;
  limitPriceGbp: number | null;
  duration: OrderDuration;
  quote: QuoteDisplay;
  prepared: PreparedLiveOrder | null;
  marketMoved: boolean;
  liveBestPriceGbp: number | null;
  onExpire: () => void;
  maxReservedLabel: string;
  requireHold: boolean;
  holdReason: string;
  submitting: boolean;
  riskDocument: { id: string; version: string; title: string; contentUrl: string | null } | null;
  riskAccepted: boolean;
  onRiskAcceptedChange: (accepted: boolean) => void;
  onBack: () => void;
  onConfirm: () => void;
}

export function TradeReviewCard({
  asset,
  side,
  orderType,
  units,
  limitPriceGbp,
  duration,
  quote,
  prepared,
  marketMoved,
  liveBestPriceGbp,
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
}: TradeReviewCardProps) {
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
              Platform fee ({Number((prepared.preview.feeRate * 100).toFixed(2))}%)
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
        <TradeQuoteCard quote={quote} />
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
      {marketMoved && liveBestPriceGbp != null ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 rounded-md border border-warning-border bg-warning-subtle px-3 py-2.5 text-meta text-warning-text"
        >
          <Icon name="warning" size={14} className="mt-0.5 shrink-0" />
          <span>
            The market moved —{' '}
            {side === 'buy' ? 'asks now print from' : 'bids now reach'}{' '}
            {gbp(liveBestPriceGbp)}. Back returns a fresh quote; confirming
            settles at the locked price above.
          </span>
        </p>
      ) : null}
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
