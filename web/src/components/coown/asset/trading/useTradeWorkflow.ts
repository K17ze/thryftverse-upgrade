import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { useWalletData } from '@/components/wallet/useWalletData';
import {
  GBP_PER_USD,
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
import type { QuoteDisplay } from './TradeQuoteCard';
import { evaluateTradeGate } from './tradeGates';
import {
  buildEffectiveAsks,
  calculateQuote,
  calculateQuoteDrift,
} from './tradeCalculations';

export interface TradePrefill {
  price: number;
  side: TradeSide;
  seq: number;
}

interface UseTradeWorkflowOptions {
  asset: CoOwnAsset;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  position: { units: number; avgEntryPriceGbp: number } | null;
  prefill?: TradePrefill | null;
}

export function useTradeWorkflow({
  asset,
  bids,
  asks,
  position,
  prefill,
}: UseTradeWorkflowOptions) {
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
    DATA_MODE === 'live'
      ? (policy?.maxOrderUnits ?? CO_OWN_MAX_UNITS)
      : CO_OWN_MAX_UNITS;
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
  // First-trade education gate — mirrors native's educationCompleted check
  const [educated, setEducated] = useState(true);
  // Risk-disclosure acceptance is a server-side consent record
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

  const effectiveAsks = useMemo<OrderBookLevel[]>(
    () =>
      buildEffectiveAsks(
        asks,
        side,
        asset.availableUnits,
        asset.unitPriceGbp,
        DATA_MODE === 'live',
      ),
    [asks, side, asset.availableUnits, asset.unitPriceGbp],
  );

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

  const quote = useMemo<QuoteDisplay>(
    () => calculateQuote(plan, limitPriceGbp, side, orderType, feeRate),
    [plan, limitPriceGbp, side, orderType, feeRate],
  );

  const holdingUnits = position?.units ?? 0;
  const izeAvailable = wallet?.ize
    ? round2(wallet.ize.settled - wallet.ize.reserved)
    : null;
  const requiredIze = round2(plan.requiredGbp / GBP_PER_USD);

  const { canSubmit, reason, requireHold, holdReason } = evaluateTradeGate({
    units,
    maxOrderUnits,
    orderType,
    limitPriceGbp,
    isOffline,
    eligibility,
    isGuest,
    wallet,
    side,
    holdingUnits,
    filledUnits: plan.filledUnits,
    izeAvailable,
    requiredIze,
    totalUnits: asset.totalUnits,
  });

  const bump = (delta: number) =>
    setUnitsText(String(Math.min(maxOrderUnits, Math.max(1, units + delta))));

  const releasePrepared = () => {
    const p = preparedRef.current;
    preparedRef.current = null;
    setPrepared(null);
    if (p) {
      void coownService
        .releaseCoOwnReservation(asset.id, p.reservation.id)
        .catch(() => {});
    }
  };

  useEffect(
    () => () => {
      const p = preparedRef.current;
      if (p) {
        void coownService
          .releaseCoOwnReservation(asset.id, p.reservation.id)
          .catch(() => {});
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
      show(
        err instanceof Error ? err.message : 'Could not prepare this order',
        'error',
      );
    } finally {
      setPreparing(false);
    }
  };

  const riskDoc = riskDisclosure?.document ?? null;
  const riskNeeded =
    DATA_MODE === 'live' &&
    riskDoc != null &&
    riskDisclosure?.accepted === false;

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
      if (
        preparedRef.current &&
        Date.now() >= preparedRef.current.validUntilMs
      ) {
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

  const { liveBestPrice, marketMoved } = calculateQuoteDrift({
    prepared,
    reviewing,
    side,
    effectiveAsks,
    bestBid,
    limitPriceGbp,
  });

  const mark = coOwnMarkGbp(asset);

  return {
    wall,
    side,
    setSide,
    orderType,
    setOrderType,
    unitsText,
    setUnitsText,
    limitText,
    setLimitText,
    limitTouched,
    setLimitTouched,
    duration,
    setDuration,
    reviewing,
    setReviewing,
    submitting,
    preparing,
    prepared,
    receipt,
    setReceipt,
    educated,
    completeEducation,
    riskAccepted,
    setRiskAccepted,
    riskDoc,
    riskNeeded,
    bestAsk,
    bestBid,
    canBuy,
    canSell,
    units,
    limitPriceGbp,
    maxOrderUnits,
    quote,
    holdingUnits,
    izeAvailable,
    requiredIze,
    canSubmit,
    reason,
    requireHold,
    holdReason,
    bump,
    releasePrepared,
    openReview,
    confirm,
    onReservationExpired,
    marketMoved,
    liveBestPrice,
    isGuest,
    wallet,
    mark,
  };
}
