import React, { useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';

import { useBackendData } from '../../context/BackendDataContext';
import { useHaptic } from '../useHaptic';

/**
 * Pull-to-refresh plumbing for BrowseScreen: the shared scroll offset that
 * feeds RefreshIndicator, the list ref registered with useScrollToTop, the
 * refresh-end debounce timer (also cleared by the backend-listings effect
 * cleanup), and the haptic + refresh + delayed spinner-stop handler.
 * Extracted verbatim.
 */
export function useBrowseRefresh() {
  const { refreshListings } = useBackendData();
  const haptic = useHaptic();

  const [refreshing, setRefreshing] = useState(false);
  const scrollY = useSharedValue(0);
  const scrollRef = React.useRef<any>(null);
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRefresh = async () => {
    haptic.patterns.refresh();
    setRefreshing(true);
    await refreshListings();
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      setRefreshing(false);
    }, 400);
  };

  return { refreshing, scrollY, scrollRef, refreshTimerRef, handleRefresh };
}
