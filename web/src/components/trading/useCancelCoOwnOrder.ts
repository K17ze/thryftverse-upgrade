'use client';

import { useQueryClient } from '@tanstack/react-query';
import type {
  CoOwnOrder,
  CoOwnPosition,
  OrderBookLevel,
  OrderBookSnapshot,
} from '@/lib/contracts/coown';
import {
  CO_OWN_OPEN_ORDERS,
  CO_OWN_POSITIONS,
} from '@/lib/data/fixtures-coown';
import { DATA_MODE } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/http';
import * as coownService from '@/lib/api/services/coown';
import { useSession } from '@/lib/session/SessionProvider';
import type { WalletData } from '@/components/wallet/useWalletData';
import { walletKeys } from '@/components/wallet/walletKeys';
import { round2 } from '@/components/wallet/convertViewModel';
import {
  BOOK_KEY,
  gbpToIze,
  ORDERS_KEY,
  POSITIONS_KEY,
  SESSION_PREFIX,
} from './tradingModel';

/**
 * Cancel a resting order — flips the status, then releases whatever the
 * order still holds: unfilled sell units return to the position, a buy's
 * 1ZE reserve is freed, and the resting depth leaves the book.
 */
export function useCancelCoOwnOrder() {
  const queryClient = useQueryClient();
  const { user } = useSession();

  const cancelOrder = async (orderId: string): Promise<boolean> => {
    const orders =
      queryClient.getQueryData<CoOwnOrder[]>([...ORDERS_KEY]) ?? CO_OWN_OPEN_ORDERS;
    const order = orders.find((o) => o.id === orderId);
    if (!order || (order.status !== 'open' && order.status !== 'partially_filled')) {
      return false;
    }

    if (DATA_MODE === 'live') {
      // The cancel route is asset-scoped and requires the authenticated
      // user's id in the body (it must match the session — a mismatch
      // 403s server-side). A refused cancel throws so the caller shows
      // the server's own error text instead of a generic failure.
      if (!user) {
        throw new ApiRequestError('Sign in to cancel orders', 401, { code: 'AUTH_REQUIRED' });
      }
      await coownService.cancelCoOwnOrder({
        assetId: order.assetId,
        orderId: order.id,
        userId: user.id,
      });
    }

    const unfilled = order.units - order.filledUnits;

    queryClient.setQueryData<CoOwnOrder[]>(ORDERS_KEY, (old) =>
      (old ?? orders).map((o) =>
        o.id === orderId ? { ...o, status: 'cancelled' as const } : o,
      ),
    );

    // Session orders hold real locks — release them. Fixture seeds were
    // never debited, so they only transition status.
    //
    // Only a limit order can rest on the book (orderExecution.ts:
    // restingUnits is 0 for market/protected), and only a resting buy
    // ever held a 1ZE reserve. A partially-filled market/protected order
    // keeps neither depth nor reserve — releasing anyway would shave
    // reserves held by other open orders.
    const rested = order.orderType === 'limit';
    if (DATA_MODE !== 'live' && order.id.startsWith(SESSION_PREFIX) && unfilled > 0) {
      if (rested) {
        const releaseBookLevel = (level: OrderBookLevel) => {
          const units = Math.max(0, level.units - unfilled);
          return { ...level, units, orderCount: Math.max(1, level.orderCount - 1) };
        };
        queryClient.setQueryData<OrderBookSnapshot | null>(BOOK_KEY(order.assetId), (old) => {
          if (!old) return old;
          const side = order.side === 'buy' ? 'bids' : 'asks';
          const next = old[side]
            .map((l) => (l.unitPriceGbp === order.unitPriceGbp ? releaseBookLevel(l) : l))
            .filter((l) => l.units > 0);
          return { ...old, [side]: next };
        });
      }

      if (order.side === 'sell') {
        // The full request was locked out of the position at placement —
        // the unfilled remainder returns for any order type.
        queryClient.setQueryData<CoOwnPosition[]>(POSITIONS_KEY, (old) =>
          (old ?? CO_OWN_POSITIONS).map((p) =>
            p.assetId === order.assetId ? { ...p, units: p.units + unfilled } : p,
          ),
        );
      } else if (rested) {
        queryClient.setQueryData<WalletData>(walletKeys.all(user?.id), (old) =>
          old?.ize
            ? {
                ...old,
                ize: {
                  ...old.ize,
                  reserved: Math.max(
                    0,
                    round2(old.ize.reserved - gbpToIze(unfilled * order.unitPriceGbp)),
                  ),
                },
              }
            : old,
        );
      }
    }

    if (DATA_MODE === 'live') {
      for (const key of [ORDERS_KEY, POSITIONS_KEY, BOOK_KEY(order.assetId), walletKeys.root]) {
        void queryClient.invalidateQueries({ queryKey: [...key] });
      }
    }
    return true;
  };

  return { cancelOrder };
}
