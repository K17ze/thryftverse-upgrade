import React from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { useBackendData } from '../../context/BackendDataContext';
import { fetchCoOwnPortfolioPositions, type CoOwnPositionVM, type CoOwnPortfolioSummary } from '../../services/coOwnPortfolio';
import { parseApiError } from '../../lib/apiClient';

const EMPTY_SUMMARY: CoOwnPortfolioSummary = {
  totalValueGbp: 0, totalUnits: 0, totalUnrealizedGbp: 0,
  totalRealizedGbp: 0, positionCount: 0,
};

/**
 * Owns the portfolio data lifecycle: positions + summary state, the
 * latest-wins guarded fetch, the focus refetch (positions reconcile after
 * a trade ticket commits/cancels while this screen stayed mounted), and
 * pull-to-refresh.
 */
export function usePortfolioData() {
  const currentUser = useStore((state) => state.currentUser);
  const { show } = useToast();
  const { listings } = useBackendData();

  const [resultViewerId, setResultViewerId] = React.useState<string | null>(null);
  const [positions, setPositions] = React.useState<CoOwnPositionVM[]>([]);
  const [summary, setSummary] = React.useState<CoOwnPortfolioSummary>(EMPTY_SUMMARY);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [isPartial, setIsPartial] = React.useState(false);

  // U40: Latest-wins request token. When a focus refresh and a manual
  // refresh overlap, the older request's result must not replace the
  // newer one. Each load increments the token; results are discarded
  // unless their token matches the current value.
  const requestTokenRef = React.useRef(0);

  React.useEffect(() => {
    requestTokenRef.current += 1;
    setPositions([]);
    setSummary(EMPTY_SUMMARY);
    setIsPartial(false);
    setIsError(false);
  }, [currentUser?.id]);

  const loadPortfolio = React.useCallback((mode: 'initial' | 'refresh' = 'initial') => {
    const token = ++requestTokenRef.current;
    if (!currentUser?.id) {
      setIsLoading(false);
      setRefreshing(false);
      return;
    }
    let cancelled = false;
    if (mode === 'refresh') setRefreshing(true);
    else setIsLoading(true);
    setIsError(false);

    fetchCoOwnPortfolioPositions(currentUser.id, listings)
      .then((result) => {
        if (cancelled || token !== requestTokenRef.current || useStore.getState().currentUser?.id !== currentUser.id) return;
        setResultViewerId(currentUser.id);
        setPositions(result.positions);
        setSummary(result.summary);
        setIsPartial(result.partial ?? false);
      })
      .catch((err) => {
        if (cancelled || token !== requestTokenRef.current || useStore.getState().currentUser?.id !== currentUser.id) return;
        const parsed = parseApiError(err, 'Unable to load portfolio');
        show(parsed.message, 'error');
        setIsError(true);
        setIsPartial(false);
      })
      .finally(() => {
        if (!cancelled && token === requestTokenRef.current) {
          setIsLoading(false);
          setRefreshing(false);
        }
      });

    return () => { cancelled = true; };
  }, [currentUser?.id, show, listings]);

  // Portfolio is often left mounted behind a trade ticket. Reconcile on
  // focus so a committed/cancelled order cannot leave an old position mark
  // visible until a full remount or manual pull-to-refresh.
  useFocusEffect(
    React.useCallback(() => {
      const cleanup = loadPortfolio();
      return () => {
        cleanup?.();
        requestTokenRef.current += 1;
      };
    }, [loadPortfolio]),
  );

  const handleRefresh = React.useCallback(() => {
    loadPortfolio('refresh');
  }, [loadPortfolio]);

  return {
    positions: resultViewerId === currentUser?.id ? positions : [],
    summary: resultViewerId === currentUser?.id ? summary : EMPTY_SUMMARY,
    isLoading,
    isError,
    refreshing,
    isPartial,
    loadPortfolio,
    handleRefresh,
  };
}
