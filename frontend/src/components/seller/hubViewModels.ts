/**
 * Seller Hub view models — pure mappers from service/store data to the
 * module prop shapes. Kept out of the screen so the orchestrator stays lean
 * and the mappings stay unit-testable.
 */

import { isTerminalStatus, normaliseOrderStatus } from '../../utils/orderDetailLogic';
import type { CommerceUserOrder } from '../../services/commerceApi';
import type { ListingApiItem } from '../../services/listingsApi';
import type { SellerHubOverview, SellerHubTask } from '../../services/sellerHubApi';
import type { SellerOrderPreview } from './SellerOrdersModule';
import type { SellerThumbRailItem } from './SellerThumbRail';

type MoneyFormatter = (value: number | null | undefined) => string;

/** GBP formatter with compact notation for large values — em dash for unknown. */
export function formatGbp(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  const isLarge = Math.abs(amount) >= 100000;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    notation: isLarge ? 'compact' : 'standard',
    maximumFractionDigits: isLarge ? 1 : 2,
    minimumFractionDigits: isLarge ? 0 : 2,
  }).format(amount);
}

/** Active orders triage first, then settled history — newest on top. */
export function toOrderPreviews(orders: CommerceUserOrder[]): SellerOrderPreview[] {
  const active: CommerceUserOrder[] = [];
  const settled: CommerceUserOrder[] = [];
  for (const order of orders) {
    if (isTerminalStatus(normaliseOrderStatus(order.status))) settled.push(order);
    else active.push(order);
  }
  return [...active, ...settled]
    .slice(0, 6)
    .map((order) => ({
      id: order.id,
      title: order.listingTitle || 'Ordered item',
      imageUri: order.listingImageUrl,
      totalGbp: order.totalGbp,
      status: order.status,
      createdAt: order.createdAt,
      shipByDate: order.shipByDate ?? null,
    }));
}

/**
 * Ship-order tasks are covered by the order rail — keep task rows for
 * everything else (offers, listing issues, payout holds, imports).
 */
export function splitTasks(
  overview: Pick<SellerHubOverview, 'tasks' | 'topTask'>,
  hasOrderRail: boolean
): { tasks: SellerHubTask[]; topTask: SellerHubTask | null } {
  const tasks = overview.tasks.filter((t) => t.type !== 'ship_order' || !hasOrderRail);
  const topTask =
    overview.topTask && tasks.some((t) => t.id === overview.topTask!.id)
      ? overview.topTask
      : null;
  return { tasks, topTask };
}

/** The seller's own live catalog, from the dedicated own-listings endpoint. */
export function toOwnListingRailItems(
  items: ListingApiItem[],
  formatMoney: MoneyFormatter
): SellerThumbRailItem[] {
  return items
    .filter((l) => l.status !== 'sold' && l.status !== 'deleted' && l.status !== 'removed')
    .slice(0, 6)
    .map((l) => ({
      id: l.id,
      imageUri: l.images?.[0] ?? l.imageUrl ?? null,
      label: l.title || 'Your listing',
      meta: l.priceGbp != null ? formatMoney(l.priceGbp) : undefined,
    }));
}
