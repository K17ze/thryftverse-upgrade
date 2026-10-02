import type {
  CoOwnAsset,
  CoOwnOrder,
  OrderBookLevel,
  OrderDuration,
  OrderType,
  TradeSide,
} from '@/lib/contracts/coown';
import type * as coownService from '@/lib/api/services/coown';
import { GBP_PER_USD, round2 } from '@/components/wallet/convertViewModel';
import type { ExecutionPlan } from './orderExecution';

// ── Shared cache addresses — must match lib/hooks/coown-queries ──────

export const ASSETS_KEY = ['coown', 'assets'] as const;
export const assetKey = (id: string) => ['coown', 'asset', id] as const;
export const BOOK_KEY = (id: string) => ['coown', 'book', id] as const;
export const ORDERS_KEY = ['coown', 'orders'] as const;
export const POSITIONS_KEY = ['coown', 'positions'] as const;
export const LEDGER_KEY = (id: string) => ['coown', 'ledger', id] as const;
export const TAPE_KEY = ['coown', 'tape'] as const;
export const ACTIVITY_KEY = (id?: string) => ['coown', 'activity', id ?? 'all'] as const;

/** Session order ids carry this prefix so cancels know a release is owed
 *  (fixture seeds were never reserved against — they only flip status). */
export const SESSION_PREFIX = 'sess-';
let seq = 0;
export const nextOrderId = () =>
  `${SESSION_PREFIX}${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** GBP obligation → 1ZE settlement units (1ZE is USD-par). */
export const gbpToIze = (gbp: number) => round2(gbp / GBP_PER_USD);

export interface PlaceOrderInput {
  asset: CoOwnAsset;
  side: TradeSide;
  orderType: OrderType;
  units: number;
  limitPriceGbp: number | null;
  /** Time-in-force for the resting remainder — limit orders only.
   *  'day' maps to GFD, 'gtc' to GTC90 on the wire. */
  duration?: OrderDuration;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  /** Stable per attempt — the server dedupes on it, so callers mint one
   *  key when the user confirms an order and reuse it across retries. */
  idempotencyKey?: string;
}

export interface PlaceOrderResult {
  order: CoOwnOrder;
  /** The evaluated plan — null in live mode (the server owns fills). */
  plan: ExecutionPlan | null;
  /** AML flag from the settled response (or its reconciled replay) —
   *  the trade landed but is under review; the receipt surfaces this. */
  aml: { alertId: string; status: string } | null;
}

/**
 * Live-mode pre-commit context: the server preview + the reservation the
 * order must be committed against. Reservations hold the order's full
 * obligation (units × bound + fee) for ~60s — `validUntilMs` is the
 * earlier of the preview's validity and the reservation expiry, i.e. the
 * real commit deadline the review UI counts down to.
 */
export interface PreparedLiveOrder {
  /** The exact command preview + reserve ran against — the commit must
   *  reuse it verbatim or the server-side idempotency/reservation hash
   *  rejects it as a different order. */
  command: coownService.CoOwnOrderCommand;
  preview: coownService.CoOwnOrderPreview;
  reservation: coownService.CoOwnOrderReservation;
  validUntilMs: number;
}
