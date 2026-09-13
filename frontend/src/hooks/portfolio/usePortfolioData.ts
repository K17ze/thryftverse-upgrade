import React from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { useBackendData } from '../../context/BackendDataContext';
import { fetchCoOwnPortfolioPositions, type CoOwnPositionVM, type CoOwnPortfolioSummary } from '../../services/coOwnPortfolio';
import { parseApiError } from '../../lib/apiClient';

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

  const [positions, setPositions] = React.useState<CoOwnPositionVM[]>([]);
  const [summary, setSummary] = React.useState<CoOwnPortfolioSummary>({
    totalValueGbp: 0,
    totalUnits: 0,
    totalUnrealizedGbp: 0,
    totalRealizedGbp: 0,
    positionCount: 0,
    totalDistributionsGbp: 0,
    todayChangeGbp: 0,
    todayChangePct: 0,
    todayChangeTimestamp: '',
    staleMarkCount: 0,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [isPartial, setIsPartial] = React.useState(false);

  // U40: Latest-wins request token. When a focus refresh and a manual
  // refresh overlap, the older request's result must not replace the
  // newer one. Each load increments the token; results are discarded
  // unless their token matches the current value.
  const requestTokenRef = React.useRef(0);

  const loadPortfolio = React.useCallback((mode: 'initial' | 'refresh' = 'initial') => {
    if (!currentUser?.id) {
      setIsLoading(false);
      setRefreshing(false);
      return;
    }
    const token = ++requestTokenRef.current;
    let cancelled = false;
    if (mode === 'refresh') setRefreshing(true);
    else setIsLoading(true);
    setIsError(false);

    fetchCoOwnPortfolioPositions(currentUser.id, listings)
      .then((result) => {
        if (cancelled || token !== requestTokenRef.current) return;
        setPositions(result.positions);
        setSummary(result.summary);
        setIsPartial(result.partial ?? false);
      })
      .catch((err) => {
        if (cancelled || token !== requestTokenRef.current) return;
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
      return cleanup;
    }, [loadPortfolio]),
  );

  const handleRefresh = React.useCallback(() => {
    loadPortfolio('refresh');
  }, [loadPortfolio]);

  return {
    positions,
    summary,
    isLoading,
    isError,
    refreshing,
    isPartial,
    loadPortfolio,
    handleRefresh,
  };
}
