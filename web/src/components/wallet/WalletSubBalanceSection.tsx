'use client';

/**
 * WalletSubBalanceSection — flat hairline-separated sub-balance hold rows.
 * Port of mobile's WalletSubBalanceSection (spec 17 viewport 2).
 *
 * Money truthfulness: GBP rows come from the ledger-backed balances read
 * (escrow-pending proceeds, payout reserve, in-flight payout); 1ZE holds
 * render in 1ZE units per the position read — never a fixture-rate GBP
 * conversion. A failed 1ZE read renders an honest unavailable note, and
 * the "no holds" claim only appears when every source reports clear.
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import { formatIze } from './convertViewModel';
import type { WalletPendingBalanceItem } from '@/lib/api/services/commerce';

/** 1ZE pocket holds — 1ZE units, exactly as the position read reports. */
export interface WalletIzeHolds {
  available: number;
  reservedForOrders: number;
  redemptionInProgress: number;
  pendingDeposit: number;
  unsettledSaleProceeds: number;
  otherHolds: number;
}

export interface WalletSubBalances {
  /** Ledger-backed GBP available — withdrawable right now. */
  withdrawableGbp: number;
  /** GBP sale proceeds in escrow (the pending balance). */
  pendingProceedsGbp: number;
  /** Per-order breakdown behind `pendingProceedsGbp`. */
  pendingOrders: WalletPendingBalanceItem[];
  /** GBP held in payout rolling reserve. */
  heldInReserveGbp: number;
  /** GBP payout in flight — null when the payout summary can't be read. */
  payoutInFlightGbp: number | null;
  /** 1ZE-side holds — null when the position read failed. */
  ize: WalletIzeHolds | null;
}

interface WalletSubBalanceSectionProps {
  balances: WalletSubBalances;
  currency: string;
  balanceHidden?: boolean;
}

const PENDING_ORDER_PREVIEW = 3;

export function WalletSubBalanceSection({
  balances,
  currency,
  balanceHidden = false,
}: WalletSubBalanceSectionProps) {
  const mask = (val: string) => (balanceHidden ? '••••••' : val);
  const gbp = (v: number) => mask(formatPrice(v, currency));
  const ize = (v: number) => mask(`${formatIze(v)} 1ZE`);

  const hasGbpHolds =
    balances.pendingProceedsGbp > 0 ||
    balances.heldInReserveGbp > 0 ||
    (balances.payoutInFlightGbp ?? 0) > 0;
  const hasIzeHolds =
    !!balances.ize &&
    (balances.ize.reservedForOrders > 0 ||
      balances.ize.redemptionInProgress > 0 ||
      balances.ize.pendingDeposit > 0 ||
      balances.ize.unsettledSaleProceeds > 0 ||
      balances.ize.otherHolds > 0);

  const shownOrders = balances.pendingOrders.slice(0, PENDING_ORDER_PREVIEW);

  return (
    <section aria-label="Sub-balance allocation" className="mt-8 px-4 sm:px-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Funds allocation
        </h2>
        <span className="text-meta text-text-muted">Escrow &amp; holds</span>
      </div>

      <div className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
        {/* Withdrawable cash (emphasized) */}
        <div className="flex items-baseline justify-between py-3">
          <div className="flex items-center gap-2">
            <Icon name="arrowUp" size={15} className="text-coown-up" />
            <span className="text-body font-medium text-text-primary">Withdrawable cash</span>
          </div>
          <span className="tnum text-body font-semibold text-text-primary">
            {gbp(balances.withdrawableGbp)}
          </span>
        </div>

        {/* GBP sale proceeds in escrow */}
        {balances.pendingProceedsGbp > 0 ? (
          <div className="py-2.5">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-body text-text-secondary">Sale proceeds clearing</span>
                <p className="text-meta text-text-muted">Releases after delivery confirmation</p>
              </div>
              <span className="tnum text-body text-warning-text">
                {gbp(balances.pendingProceedsGbp)}
              </span>
            </div>
            {shownOrders.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {shownOrders.map((o) => (
                  <li
                    key={o.orderId}
                    className="flex items-baseline justify-between gap-3 text-meta"
                  >
                    <Link
                      href={`/orders/${o.orderId}`}
                      className="pressable min-w-0 truncate text-text-muted hover:text-text-primary"
                    >
                      {o.listingTitle ?? `Order ${o.orderId}`}
                    </Link>
                    <span className="tnum shrink-0 text-text-muted">
                      {mask(formatPrice(o.amountGbp, currency))}
                      {o.releaseScheduledAt
                        ? ` · releases ${new Date(o.releaseScheduledAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                          })}`
                        : ''}
                    </span>
                  </li>
                ))}
                {balances.pendingOrders.length > shownOrders.length ? (
                  <li className="text-meta text-text-muted">
                    +{balances.pendingOrders.length - shownOrders.length} more pending order
                    {balances.pendingOrders.length - shownOrders.length === 1 ? '' : 's'}
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* GBP held in payout reserve */}
        {balances.heldInReserveGbp > 0 ? (
          <div className="flex items-baseline justify-between py-2.5">
            <div>
              <span className="text-body text-text-secondary">Held in reserve</span>
              <p className="text-meta text-text-muted">Rolling payout reserve</p>
            </div>
            <span className="tnum text-body text-text-muted">
              {gbp(balances.heldInReserveGbp)}
            </span>
          </div>
        ) : null}

        {/* GBP payout in flight */}
        {(balances.payoutInFlightGbp ?? 0) > 0 ? (
          <div className="flex items-baseline justify-between py-2.5">
            <div>
              <span className="text-body text-text-secondary">Payout in progress</span>
              <p className="text-meta text-text-muted">On its way to your bank</p>
            </div>
            <span className="tnum text-body text-text-muted">
              {gbp(balances.payoutInFlightGbp ?? 0)}
            </span>
          </div>
        ) : null}

        {/* 1ZE holds — rendered in 1ZE units, the native grammar. */}
        {balances.ize ? (
          <>
            {balances.ize.reservedForOrders > 0 ? (
              <div className="flex items-baseline justify-between py-2.5">
                <span className="text-body text-text-secondary">1ZE held for open orders</span>
                <span className="tnum text-body text-text-muted">
                  {ize(balances.ize.reservedForOrders)}
                </span>
              </div>
            ) : null}
            {balances.ize.redemptionInProgress > 0 ? (
              <div className="flex items-baseline justify-between py-2.5">
                <span className="text-body text-text-secondary">1ZE redemption in progress</span>
                <span className="tnum text-body text-text-muted">
                  {ize(balances.ize.redemptionInProgress)}
                </span>
              </div>
            ) : null}
            {balances.ize.unsettledSaleProceeds > 0 ? (
              <div className="flex items-baseline justify-between py-2.5">
                <span className="text-body text-text-secondary">1ZE unsettled proceeds</span>
                <span className="tnum text-body text-text-muted">
                  {ize(balances.ize.unsettledSaleProceeds)}
                </span>
              </div>
            ) : null}
            {balances.ize.pendingDeposit > 0 ? (
              <div className="flex items-baseline justify-between py-2.5">
                <span className="text-body text-text-secondary">1ZE deposit clearing</span>
                <span className="tnum text-body text-text-muted">
                  {ize(balances.ize.pendingDeposit)}
                </span>
              </div>
            ) : null}
            {balances.ize.otherHolds > 0 ? (
              <div className="flex items-baseline justify-between py-2.5">
                <span className="text-body text-text-secondary">1ZE other holds</span>
                <span className="tnum text-body text-text-muted">
                  {ize(balances.ize.otherHolds)}
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <div className="py-2.5">
            <p className="flex items-start gap-1.5 text-meta text-text-muted">
              <Icon name="info" size={13} className="mt-0.5 shrink-0" />
              1ZE holds couldn&apos;t be loaded — any unit holds aren&apos;t shown.
            </p>
          </div>
        )}

        {/* Standalone status note — only asserted when every source is clear */}
        {!hasGbpHolds && !hasIzeHolds && balances.ize ? (
          <div className="py-2.5">
            <p className="text-meta text-text-muted">
              All settled funds are fully cleared — no active holds.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
