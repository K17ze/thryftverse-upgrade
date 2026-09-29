'use client';

/**
 * WalletCurrencyPockets — the multi-currency pocket list. Web port of
 * native WalletCurrencyBalances: non-zero currency pockets, hairline-
 * separated rows, flat canvas. Hidden when the only funded pocket is the
 * default fiat one (the hero already carries it). The trailing "Exchange"
 * affordance opens the fiat↔fiat converter.
 *
 * Money truthfulness: pockets come straight from
 * GET /wallets/:userId/currency-balances, amounts render via
 * formatMinorAmount (minor units, never floats). Live mode only — fixture
 * wallets have no currency pockets, so the section is absent there rather
 * than authored. Guests render nothing (no user id → no fetch).
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';
import { DATA_MODE } from '@/lib/api/client';
import {
  formatMinorAmount,
  getCurrencyBalances,
  type WalletCurrencyPocket,
} from '@/lib/api/services/fx';
import { CURRENCIES, type SupportedCurrencyCode } from '@/lib/constants/currencies';
import { useSession } from '@/lib/session/SessionProvider';
import { walletKeys } from './walletKeys';

interface WalletCurrencyPocketsProps {
  /** Privacy-eye mirror — masks amounts with the '••••••' grammar. */
  balanceHidden?: boolean;
}

interface MergedPockets {
  /** The wallet's default fiat currency — orders first when rendered. */
  fiatCurrency: string;
  pockets: WalletCurrencyPocket[];
}

export function WalletCurrencyPockets({ balanceHidden = false }: WalletCurrencyPocketsProps) {
  const { user } = useSession();
  const userId = user?.id;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: walletKeys.currencyBalances(userId),
    queryFn: async ({ signal }): Promise<MergedPockets> => {
      const payload = await getCurrencyBalances(userId as string, signal);
      // The default fiat pocket is authoritative via fiatBalanceMinor —
      // upsert it over any matching balances[] entry so the row always
      // shows the ledger-backed figure (mirrors the native merge).
      const merged = new Map<string, WalletCurrencyPocket>();
      payload.balances.forEach((pocket) => merged.set(pocket.currency, pocket));
      merged.set(payload.fiatCurrency, {
        currency: payload.fiatCurrency,
        balanceMinor: payload.fiatBalanceMinor,
        version: merged.get(payload.fiatCurrency)?.version ?? 0,
      });
      return { fiatCurrency: payload.fiatCurrency, pockets: Array.from(merged.values()) };
    },
    enabled: DATA_MODE === 'live' && !!userId,
  });

  // Fixture mode has no pockets and guests have no user id — absent beats
  // fabricated, so the section simply doesn't render.
  if (DATA_MODE !== 'live' || !userId) return null;

  // ── Loading (first fetch — no pockets to show yet) ──
  if (isLoading) {
    return (
      <section aria-label="Currency balances" aria-busy className="mt-8 px-4 sm:px-6">
        <h2 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Currency balances
        </h2>
        <div className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-baseline justify-between py-3">
              <Skeleton className="h-4 w-[40%]" />
              <Skeleton className="h-4 w-[25%]" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // ── Error (no pockets to fall back to — TanStack keeps last-good data
  //    on a failed refetch, so this row only renders when there's nothing
  //    else to show) ──
  if (isError && !data) {
    return (
      <section aria-label="Currency balances" className="mt-8 px-4 sm:px-6">
        <h2 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Currency balances
        </h2>
        <div className="mt-2 flex items-baseline justify-between border-y border-border-subtle py-3">
          <span className="text-body text-danger-text">
            Couldn&apos;t load currency balances.
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  // ── Derived rows ──
  const nonZero = (data?.pockets ?? []).filter((pocket) => pocket.balanceMinor !== 0);
  const nonDefault = nonZero.filter((pocket) => pocket.currency !== data?.fiatCurrency);

  // Nothing to show: the default fiat pocket alone is already covered by
  // the balance hero — render nothing rather than restate it.
  if (nonDefault.length === 0) return null;

  const ordered = [...nonZero].sort((a, b) => {
    if (a.currency === data?.fiatCurrency) return -1;
    if (b.currency === data?.fiatCurrency) return 1;
    return 0;
  });

  return (
    <section aria-label="Currency balances" className="mt-8 px-4 sm:px-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
          Currency balances
        </h2>
        <span className="flex items-baseline gap-4">
          <Link
            href="/wallet/send"
            className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
          >
            Send
          </Link>
          <Link
            href="/wallet/exchange"
            className="pressable text-caption font-semibold text-text-secondary hover:text-text-primary"
          >
            Exchange
          </Link>
        </span>
      </div>
      <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
        {ordered.map((pocket) => {
          const code = pocket.currency.toUpperCase();
          const meta = CURRENCIES[code as SupportedCurrencyCode];
          const label = meta ? `${meta.name} · ${meta.code}` : code;
          const value = balanceHidden
            ? '••••••'
            : formatMinorAmount(pocket.balanceMinor, pocket.currency);
          return (
            <li
              key={pocket.currency}
              className="flex items-baseline justify-between gap-4 py-3"
              aria-label={`${label}: ${value}`}
            >
              <span className="text-body text-text-muted">{label}</span>
              <span className="tnum text-body font-medium text-text-secondary">{value}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
