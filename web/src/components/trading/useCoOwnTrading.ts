'use client';

/**
 * Co-Own order lifecycle — the single write path for trades and cancels.
 * Fixture mode treats the react-query cache as the session ledger (same
 * posture as the coown query hooks): a confirmed order writes the order
 * row, updates the position, prints to the market tape + activity feed,
 * mutates the book, and settles against the wallet's 1ZE pocket — all in
 * one pass, so a receipt can never claim a fill no state supports.
 *
 * Live mode posts to /co-own/* and re-reads the affected queries.
 */

import { useQueryClient } from '@tanstack/react-query';
import type {
  CoOwnOrder,
  CoOwnPosition,
} from '@/lib/contracts/coown';
import {
  CO_OWN_POSITIONS,
} from '@/lib/data/fixtures-coown';
import { DATA_MODE } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/http';
import * as coownService from '@/lib/api/services/coown';
import { useSession } from '@/lib/session/SessionProvider';
import type { WalletData } from '@/components/wallet/useWalletData';
import { walletKeys } from '@/components/wallet/walletKeys';
import { round2 } from '@/components/wallet/convertViewModel';
import { planExecution, type ExecutionPlan } from './orderExecution';
import {
  ACTIVITY_KEY,
  ASSETS_KEY,
  assetKey,
  BOOK_KEY,
  gbpToIze,
  LEDGER_KEY,
  nextOrderId,
  ORDERS_KEY,
  type PlaceOrderInput,
  type PlaceOrderResult,
  POSITIONS_KEY,
  type PreparedLiveOrder,
  TAPE_KEY,
} from './tradingModel';
import {
  applyFixtureOrderSettlement,
  pinSessionKeys,
} from './fixtureSettlement';

export type { PlaceOrderInput, PlaceOrderResult, PreparedLiveOrder };
export { useCancelCoOwnOrder } from './useCancelCoOwnOrder';

export function usePlaceCoOwnOrder() {
  const queryClient = useQueryClient();
  const { user } = useSession();

  /**
   * Convert the composer's order type into the only two the ingest schema
   * accepts. A UI 'market' order becomes protected_market bounded at the
   * worst price the displayed fill plan walked — "everything the book
   * shows" is a bound, not an uncapped sweep — and it can never rest.
   * 'protected_market' bounds at the plan's ±1.5% protection cap; 'limit'
   * passes the limit price through untouched.
   */
  const buildWireCommand = (
    input: PlaceOrderInput,
    userId: string,
    plan: ExecutionPlan,
  ): coownService.CoOwnOrderCommand => {
    const { side, orderType, units, limitPriceGbp } = input;
    if (orderType === 'limit') {
      return {
        userId,
        side,
        units,
        orderType: 'limit',
        limitPriceGbp: limitPriceGbp ?? undefined,
      };
    }
    const boundGbp =
      orderType === 'protected_market'
        ? plan.capPriceGbp
        : (plan.worstFillPriceGbp ?? plan.referencePriceGbp);
    if (boundGbp == null || !(boundGbp > 0)) {
      // The bound is the money-truth the reservation prices against —
      // refuse rather than let the wire call 400 on a missing price.
      throw new ApiRequestError(
        'No live price available to bound this order — wait for the book to refresh.',
        undefined,
        { code: 'NO_BOUND_PRICE' },
      );
    }
    return {
      userId,
      side,
      units,
      orderType: 'protected_market',
      ...(side === 'buy' ? { maxPriceGbp: boundGbp } : { minPriceGbp: boundGbp }),
    };
  };

  /**
   * Live pre-commit — the web port of the mobile TradeScreen submit:
   * POST /orders/preview for the server's fee/fill estimate and the
   * per-notional eligibility verdict, then POST /orders/reserve to hold
   * the full obligation (~60s TTL). placeOrder commits against the
   * returned reservation; the review surface counts down to
   * `validUntilMs` and releases the reservation on abandon. Fixture mode
   * returns null — there is no server reservation to hold.
   */
  const prepareOrder = async (input: PlaceOrderInput): Promise<PreparedLiveOrder | null> => {
    if (DATA_MODE !== 'live') return null;
    if (!user) throw new Error('auth_required');
    const plan = planExecution({
      side: input.side,
      orderType: input.orderType,
      units: input.units,
      limitPriceGbp: input.limitPriceGbp,
      bids: input.bids,
      asks: input.asks,
    });
    const command = buildWireCommand(input, user.id, plan);
    const preview = await coownService.previewCoOwnOrder(input.asset.id, command);
    if (!preview.eligibility.allowed) {
      // The preview's verdict is the same evaluateMarketEligibility the
      // commit re-runs — surface its message verbatim, don't place anyway.
      throw new ApiRequestError(
        preview.eligibility.message || 'This order is not available for your account',
        403,
        { code: preview.eligibility.code ?? 'ORDER_NOT_ELIGIBLE' },
      );
    }
    const reservation = await coownService.reserveCoOwnOrder(input.asset.id, {
      ...command,
      idempotencyKey: coownService.newCoOwnReserveAttemptKey(),
    });
    return {
      command,
      preview,
      reservation,
      validUntilMs: Math.min(
        Date.parse(preview.validUntil),
        Date.parse(reservation.expiresAt),
      ),
    };
  };

  const placeOrder = async (
    input: PlaceOrderInput & { prepared?: PreparedLiveOrder | null },
  ): Promise<PlaceOrderResult> => {
    const { asset, side, orderType, units, limitPriceGbp } = input;
    // Duration is only meaningful when part of the order can rest.
    const duration = orderType === 'limit' ? (input.duration ?? 'gtc') : undefined;

    // Ledger-level enforcement — the composer gate is UX; the write path
    // re-checks whatever state it settles against so a stale UI can't
    // push an order the ledger wouldn't honour.
    if (!user) throw new Error('auth_required');

    if (DATA_MODE === 'live') {
      const prepared = input.prepared;
      if (!prepared) {
        // The backend rejects a placement with no reservation — refuse
        // early instead of shipping an order that can't execute.
        throw new ApiRequestError(
          'This order needs a fresh reservation — review it again.',
          undefined,
          { code: 'RESERVATION_REQUIRED' },
        );
      }
      if (
        prepared.command.side !== side ||
        prepared.command.units !== units ||
        prepared.command.userId !== user.id
      ) {
        // The reservation hash covers side/units/prices — a composer edit
        // after review must re-prepare, not commit against a stale hold.
        throw new ApiRequestError(
          'The order changed since it was reserved — review it again.',
          undefined,
          { code: 'RESERVATION_MISMATCH' },
        );
      }
      // Missing keys fail closed — a real money command without a dedupe
      // key is refused rather than sent unreconcilable.
      const idempotencyKey =
        input.idempotencyKey ??
        (() => {
          throw new Error('idempotency_key_required');
        })();
      let order: CoOwnOrder;
      let aml: { alertId: string; status: string } | null = null;
      try {
        const placed = await coownService.placeCoOwnOrder({
          assetId: asset.id,
          ...prepared.command,
          reservationId: prepared.reservation.id,
          timeInForce: duration === 'day' ? 'GFD' : duration === 'gtc' ? 'GTC90' : undefined,
          idempotencyKey,
        });
        order = placed.order;
        aml = placed.aml;
      } catch (err) {
        // Ambiguous outcomes reconcile through lookup-by-key before the
        // user is told anything: a 202 ack, a dropped connection, or a
        // 5xx after the write landed all leave the result unknown. The
        // idempotency key answers it — acknowledged means the order did
        // place (return it), safe_to_retry rethrows the original refusal.
        const ambiguous =
          err instanceof ApiRequestError &&
          (err.status === 202 || err.status === undefined || err.status >= 500);
        if (!ambiguous) throw err;
        const settled = await coownService.reconcileCoOwnOrder(asset.id, idempotencyKey);
        if (settled.status === 'acknowledged') {
          order = settled.order;
          aml = settled.aml;
        } else if (settled.status === 'processing') {
          throw new ApiRequestError(
            'The order is still settling — check open orders before placing another.',
            202,
            { code: 'ORDER_STILL_PROCESSING' },
          );
        } else {
          throw err;
        }
      }
      for (const key of [
        ORDERS_KEY,
        POSITIONS_KEY,
        BOOK_KEY(asset.id),
        LEDGER_KEY(asset.id),
        TAPE_KEY,
        assetKey(asset.id),
        ASSETS_KEY,
        ACTIVITY_KEY(asset.id),
        walletKeys.root,
      ]) {
        void queryClient.invalidateQueries({ queryKey: [...key] });
      }
      return { order, plan: null, aml };
    }

    const plan = planExecution({ side, orderType, units, limitPriceGbp, bids: input.bids, asks: input.asks });

    // Every order settles against the 1ZE pocket — if the wallet entry
    // or its pocket isn't in the cache there's nothing truthful to
    // debit/credit.
    const wallet = queryClient.getQueryData<WalletData>(walletKeys.all(user.id));
    if (!wallet?.ize) throw new Error('wallet_unavailable');
    if (side === 'sell') {
      const positions =
        queryClient.getQueryData<CoOwnPosition[]>([...POSITIONS_KEY]) ?? CO_OWN_POSITIONS;
      const held = positions.find((p) => p.assetId === asset.id)?.units ?? 0;
      if (units > held) throw new Error('insufficient_units');
    } else {
      const availableIze = round2(wallet.ize.settled - wallet.ize.reserved);
      if (gbpToIze(plan.requiredGbp) > availableIze + 0.005) {
        throw new Error('insufficient_funds');
      }
    }

    const now = new Date().toISOString();
    const restingPrice = plan.restingUnits > 0 ? (limitPriceGbp ?? 0) : 0;
    const fullGross = round2(plan.fillGrossGbp + plan.restingUnits * restingPrice);
    const fullFee = round2(fullGross * 0.01);

    const order: CoOwnOrder = {
      id: nextOrderId(),
      assetId: asset.id,
      side,
      orderType,
      unitPriceGbp:
        orderType === 'limit'
          ? (limitPriceGbp ?? plan.referencePriceGbp)
          : (plan.avgFillPriceGbp ?? plan.referencePriceGbp),
      units,
      filledUnits: plan.filledUnits,
      status: plan.status,
      // Fee charged to date — the resting remainder's fee lands at fill.
      feeGbp: plan.fillFeeGbp,
      totalGbp: side === 'buy' ? round2(fullGross + fullFee) : round2(fullGross - fullFee),
      duration,
      placedAt: now,
    };

    pinSessionKeys(queryClient, user.id, asset.id);

    applyFixtureOrderSettlement({
      queryClient,
      user,
      asset,
      side,
      units,
      order,
      plan,
      now,
    });

    // Fixture mode has no AML monitor — no flag is a literal absence.
    return { order, plan, aml: null };
  };

  return { prepareOrder, placeOrder };
}
