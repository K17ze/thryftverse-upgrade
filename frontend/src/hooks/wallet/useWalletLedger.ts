import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { getWalletLedger, type WalletLedgerItem } from '../../services/walletApi';

export interface UseWalletLedgerOptions {
  /** Optional filter — 'ALL' shows everything, '1ZE' or 'FIAT' filters by asset */
  assetFilter?: 'ALL' | '1ZE' | 'FIAT';
  /** Limit number of items to fetch */
  limit?: number;
}

export interface WalletLedgerState {
  items: WalletLedgerItem[];
  isLoading: boolean;
  isError: boolean;
  refreshing: boolean;
  /** Silent reload — the pull-to-refresh affordance is the loading state. */
  refresh: () => void;
  /** Full reload with the loading skeleton — error recovery. */
  retry: () => void;
}

/**
 * useWalletLedger — the single owner of the wallet ledger fetch. One fetch
 * per mount, silent refreshes afterwards; consumed by both the wallet-home
 * preview and the full Activity list so no surface fetches (or refreshes)
 * the ledger twice.
 */
export function useWalletLedger({ assetFilter = 'ALL', limit = 100 }: UseWalletLedgerOptions = {}): WalletLedgerState {
  const currentUser = useStore((state) => state.currentUser);

  const [items, setItems] = useState<WalletLedgerItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const fetchLedger = useCallback(async (showLoading: boolean) => {
    if (!currentUser?.id) {
      setIsLoading(false);
      return;
    }
    if (showLoading) setIsLoading(true);
    setIsError(false);

    try {
      const response = await getWalletLedger(currentUser.id, { asset: assetFilter, limit });
      if (isMountedRef.current) setItems(response.items);
    } catch {
      if (isMountedRef.current) setIsError(true);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setRefreshing(false);
      }
    }
  }, [currentUser?.id, assetFilter, limit]);

  useEffect(() => {
    void fetchLedger(true);
  }, [fetchLedger]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void fetchLedger(false);
  }, [fetchLedger]);

  const retry = useCallback(() => {
    void fetchLedger(true);
  }, [fetchLedger]);

  return { items, isLoading, isError, refreshing, refresh, retry };
}
