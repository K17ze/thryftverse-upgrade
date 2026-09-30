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
  // First-trade education gate — mirrors native's educationCompleted check
  // before the Trade entry (AssetDetailScreen.tsx:842). Persisted
  // device-local on both platforms; hydrated in an effect so SSR renders
  // the gate-free path for returning users.
  const [educated, setEducated] = useState(true);
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

  useEffect(() => {
    setEducated(
      window.localStorage.getItem('thryftverse:coown-onboarded') === '1',
    );
  }, []);

  const completeEducation = () => {
    window.localStorage.setItem('thryftverse:coown-onboarded', '1');
    setEducated(true);
  };

  // Platform trading fee — the detail wire's own rate (the same constant
  // the server charges) where the dossier carries it; fixtures keep the
  // 1% their orders actually bill. Display + pre-preview estimate only —
  // live reservation/commit math stays server-quoted.
  const feeRate = asset.dossier?.tradingFeeRate ?? CO_OWN_FEE_RATE;

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

  // Units are integers — the field strips to digits on change, so the
  // displayed number IS what quotes and submits. Never re-interpret it.
  const units = Math.min(maxOrderUnits, Math.max(0, Number(unitsText) || 0));
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

  // Adverse-movement check (native parity): the reservation locks the
  // user's price server-side, so drift can only mean the live book moved
  // in the user's favour — committing would settle at the stale locked
  // price. Warn and offer re-quote; the locked price itself stays valid.
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

  // Position worth marks at the last settled trade once the market has
  // printed — not the issuance price.
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
