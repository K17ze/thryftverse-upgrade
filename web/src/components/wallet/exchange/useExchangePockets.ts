import { useEffect, useMemo, useRef, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import {
  getCurrencyBalances,
  type WalletCurrencyPocket,
} from '@/lib/api/services/fx';
import {
  SUPPORTED_CURRENCY_CODES,
  toSupportedCurrency,
  type SupportedCurrencyCode,
} from '@/lib/constants/currencies';
import { WALLET_BALANCE } from '@/lib/data/fixtures';
import type { User } from '@/lib/contracts/domain';
import { walletKeys } from '../walletKeys';
import type { WalletData } from '../useWalletData';
import { FIXTURE_FOREIGN_POCKETS } from './exchangeModel';

export interface UseExchangePocketsParams {
  user: User | null;
  isLive: boolean;
  queryClient: QueryClient;
}

export function useExchangePockets({ user, isLive, queryClient }: UseExchangePocketsParams) {
  const [pockets, setPockets] = useState<WalletCurrencyPocket[] | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [balanceError, setBalanceError] = useState(false);
  const [balanceNonce, setBalanceNonce] = useState(0);
  const pairSeededRef = useRef(false);

  const [sourceCurrency, setSourceCurrency] = useState<SupportedCurrencyCode>('GBP');
  const [targetCurrency, setTargetCurrency] = useState<SupportedCurrencyCode>('USD');

  useEffect(() => {
    if (!user?.id) {
      setPockets(null);
      setIsHydrating(false);
      return;
    }
    let cancelled = false;
    setIsHydrating(true);
    setBalanceError(false);

    const hydrate: Promise<{ list: WalletCurrencyPocket[]; fiatCurrency: string }> = isLive
      ? getCurrencyBalances(user.id).then((payload) => {
          const merged = new Map<string, WalletCurrencyPocket>();
          payload.balances.forEach((pocket) => merged.set(pocket.currency, pocket));
          merged.set(payload.fiatCurrency, {
            currency: payload.fiatCurrency,
            balanceMinor: payload.fiatBalanceMinor,
            version: merged.get(payload.fiatCurrency)?.version ?? 0,
          });
          return { list: Array.from(merged.values()), fiatCurrency: payload.fiatCurrency };
        })
      : new Promise((resolve) =>
          window.setTimeout(() => {
            const cached = queryClient.getQueryData<WalletData>(walletKeys.all(user.id));
            const gbpMajor = cached?.available ?? WALLET_BALANCE.available;
            resolve({
              list: [
                { currency: 'GBP', balanceMinor: Math.round(gbpMajor * 100), version: 0 },
                ...FIXTURE_FOREIGN_POCKETS,
              ],
              fiatCurrency: 'GBP',
            });
          }, 320),
        );

    hydrate
      .then(({ list, fiatCurrency }) => {
        if (cancelled) return;
        setPockets(list);
        if (!pairSeededRef.current) {
          pairSeededRef.current = true;
          const source = toSupportedCurrency(fiatCurrency) ?? 'GBP';
          const other = list.find(
            (pocket) =>
              pocket.currency !== source &&
              pocket.balanceMinor !== 0 &&
              toSupportedCurrency(pocket.currency) !== null,
          );
          setSourceCurrency(source);
          setTargetCurrency(
            other
              ? (toSupportedCurrency(other.currency) as SupportedCurrencyCode)
              : source === 'USD'
                ? 'GBP'
                : 'USD',
          );
        }
      })
      .catch(() => {
        if (!cancelled) setBalanceError(true);
      })
      .finally(() => {
        if (!cancelled) setIsHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLive, user?.id, balanceNonce, queryClient]);

  const sourcePocket = pockets?.find(
    (pocket) => pocket.currency.toUpperCase() === sourceCurrency,
  );
  const sourceBalanceMinor = sourcePocket?.balanceMinor ?? 0;

  const sourceCodes = useMemo(() => {
    const funded = new Set(
      (pockets ?? [])
        .filter((pocket) => pocket.balanceMinor > 0)
        .map((pocket) => pocket.currency.toUpperCase()),
    );
    return [
      ...SUPPORTED_CURRENCY_CODES.filter((code) => funded.has(code)),
      ...SUPPORTED_CURRENCY_CODES.filter((code) => !funded.has(code)),
    ];
  }, [pockets]);

  return {
    pockets,
    setPockets,
    isHydrating,
    balanceError,
    balanceNonce,
    setBalanceNonce,
    sourceCurrency,
    setSourceCurrency,
    targetCurrency,
    setTargetCurrency,
    sourcePocket,
    sourceBalanceMinor,
    sourceCodes,
  };
}
