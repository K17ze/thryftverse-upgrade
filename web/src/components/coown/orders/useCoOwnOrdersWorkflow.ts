'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';
import { useCoOwnOrders, useCoOwnAssets } from '@/lib/hooks/coown-queries';
import { useMyMarketHistory } from '@/lib/hooks/coown-history-queries';
import { useCancelCoOwnOrder } from '@/components/trading/useCoOwnTrading';
import { useToast } from '@/components/ui/Toast';
import { historySide, type SideFilter } from './CoOwnOrdersPrimitives';

export function useCoOwnOrdersWorkflow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isGuest, sessionLoading } = useSession();
  const { show } = useToast();
  const { cancelOrder } = useCancelCoOwnOrder();
  const highlight = searchParams.get('order');
  const [side, setSide] = useState<SideFilter>('all');

  const ordersQ = useCoOwnOrders();
  const assetsQ = useCoOwnAssets();
  const historyQ = useMyMarketHistory('co-own');

  const live = DATA_MODE === 'live';

  const titleFor = useMemo(() => {
    const map = new Map((assetsQ.data ?? []).map((a) => [a.id, a.title] as const));
    return (assetId: string) => map.get(assetId) ?? 'Co-Own asset';
  }, [assetsQ.data]);

  const openOrders = useMemo(
    () =>
      (ordersQ.data ?? []).filter(
        (o) =>
          (o.status === 'open' || o.status === 'partially_filled') &&
          (side === 'all' || o.side === side),
      ),
    [ordersQ.data, side],
  );

  const terminalOrders = useMemo(
    () =>
      (ordersQ.data ?? []).filter(
        (o) =>
          o.status !== 'open' &&
          o.status !== 'partially_filled' &&
          (side === 'all' || o.side === side),
      ),
    [ordersQ.data, side],
  );

  const historyItems = useMemo(() => {
    const flat = (historyQ.data?.pages ?? []).flatMap((p) => p.items);
    return side === 'all' ? flat : flat.filter((i) => historySide(i) === side);
  }, [historyQ.data, side]);

  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!highlight || scrolledRef.current) return;
    if (ordersQ.data === undefined && historyQ.data === undefined) return;
    scrolledRef.current = true;
    const el = document.getElementById(`order-${highlight}`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlight, ordersQ.data, historyQ.data]);

  const onCancel = async (id: string) => {
    const ok = await cancelOrder(id);
    if (!ok) show('Could not cancel the order — try again.', 'error');
    else show('Order cancelled', 'success');
  };

  return {
    router,
    user,
    isGuest,
    sessionLoading,
    live,
    side,
    setSide,
    ordersQ,
    historyQ,
    titleFor,
    openOrders,
    terminalOrders,
    historyItems,
    highlight,
    onCancel,
  };
}

export type CoOwnOrdersWorkflow = ReturnType<typeof useCoOwnOrdersWorkflow>;
