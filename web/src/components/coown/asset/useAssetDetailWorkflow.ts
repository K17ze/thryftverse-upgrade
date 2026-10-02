'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { useCancelCoOwnOrder } from '@/components/trading/useCoOwnTrading';
import type { CoOwnOrder, PriceWindow } from '@/lib/contracts/coown';
import {
  useCoOwnActivity,
  useCoOwnAsset,
  useCoOwnAssets,
  useCoOwnOrders,
  useCoOwnPositions,
  useDistributions,
  useDueDiligence,
  useGovernanceActions,
  useMarketLedger,
  useOrderBook,
  usePriceHistory,
} from '@/lib/hooks/coown-queries';
import { useCoOwnWatchlist } from '@/lib/store/coownWatchlist';
import { useHydrated } from '@/lib/store/useStore';
import { useOnlineStatus } from '@/lib/offline';
import { useCoOwnOrderBookStream } from '@/lib/realtime/useCoOwnOrderBookStream';
import { useCoOwnAlertsApi, useEvaluateCoOwnAlerts } from '../alertStore';
import type { TradePrefill } from './TradePanel';
import { useSession } from '@/lib/session/SessionProvider';

export type Tab = 'overview' | 'ownership' | 'activity';

export const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'ownership', label: 'Ownership' },
  { value: 'activity', label: 'Activity' },
];

export function useAssetDetailWorkflow(id: string) {
  const router = useRouter();
  const { data: asset, isLoading, isError } = useCoOwnAsset(id);
  const { data: book } = useOrderBook(id);
  const [range, setRange] = useState<PriceWindow>('1D');
  const { data: history } = usePriceHistory(id, range);
  const { data: dayHistory } = usePriceHistory(id, '1D');
  const { data: positions } = useCoOwnPositions();
  const { data: allOrders } = useCoOwnOrders();
  const { data: activity } = useCoOwnActivity(id);
  const { data: ledger } = useMarketLedger(id);
  const { data: diligence } = useDueDiligence(id);
  const { data: distributions } = useDistributions(id);
  const { data: actions } = useGovernanceActions(id);
  const { data: allAssets } = useCoOwnAssets();
  const hydrated = useHydrated();

  useCoOwnOrderBookStream(id);
  const { isOffline } = useOnlineStatus();
  const { alerts, ready: alertsReady } = useCoOwnAlertsApi();
  const hasAlert = alertsReady && alerts.some((a) => a.assetId === id && a.active);
  const storedWatching = useCoOwnWatchlist((s) => s.watchedIds.includes(id));
  const toggleWatch = useCoOwnWatchlist((s) => s.toggleWatch);
  const watching = hydrated && storedWatching;
  const { user } = useSession();
  useEvaluateCoOwnAlerts();

  const [tab, setTab] = useState<Tab>('overview');
  const tabsId = useId();
  const [prefill, setPrefill] = useState<TradePrefill | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [alertSheetOpen, setAlertSheetOpen] = useState(false);
  const seq = useRef(0);
  const { show } = useToast();
  const { cancelOrder } = useCancelCoOwnOrder();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const orders = (allOrders ?? []).filter(
    (o) => o.assetId === id && (o.status === 'open' || o.status === 'partially_filled'),
  );

  const position = positions?.find((p) => p.assetId === id) ?? null;

  const cancel = async (order: CoOwnOrder) => {
    setCancellingId(order.id);
    try {
      const ok = await cancelOrder(order.id);
      show(
        ok ? 'Order cancelled — remainder released' : 'Could not cancel that order',
        ok ? 'info' : 'error',
      );
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not cancel that order', 'error');
    } finally {
      setCancellingId(null);
      setConfirmingId(null);
    }
  };

  const pickLevel = (price: number, side: 'buy' | 'sell') => {
    setPrefill({ price, side, seq: ++seq.current });
    setComposerOpen(true);
  };

  const halted = asset?.marketStatus === 'paused' || asset?.marketStatus === 'closed';
  const preview = asset?.listingTier === 'preview';
  const delisted = asset?.listingTier === 'delisted';
  const isIssuer = !!user && !!asset && user.id === asset.issuer.id;

  return {
    router,
    asset,
    isLoading,
    isError,
    book,
    range,
    setRange,
    history,
    dayHistory,
    position,
    orders,
    activity,
    ledger,
    diligence,
    distributions,
    actions,
    allAssets,
    isOffline,
    hasAlert,
    watching,
    toggleWatch,
    tab,
    setTab,
    tabsId,
    prefill,
    composerOpen,
    setComposerOpen,
    alertSheetOpen,
    setAlertSheetOpen,
    confirmingId,
    setConfirmingId,
    cancellingId,
    cancel,
    pickLevel,
    halted,
    preview,
    delisted,
    isIssuer,
  };
}

export type AssetDetailWorkflow = ReturnType<typeof useAssetDetailWorkflow>;
