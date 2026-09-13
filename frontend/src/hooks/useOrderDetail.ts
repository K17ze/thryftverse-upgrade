import { useState, useCallback, useRef, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../platform/server/queryKeys';
import { useBackendData } from '../context/BackendDataContext';
import {
  normaliseOrderStatus,
  isTerminalStatus,
} from '../utils/orderDetailLogic';
import {
  type CommerceOrder,
  type OrderParcelEvent,
  getOrder,
  getOrderParcelEvents,
  cancelOrder,
  deliverOrder,
} from '../services/commerceApi';
import { getOrderReview } from '../services/reviewApi';
import { parseApiError } from '../lib/apiClient';
import { t } from '../i18n';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';

export type OrderMutation = 'cancel' | 'ship' | 'deliver' | 'refund' | null;

export interface UseOrderDetailResult {
  backendOrder: CommerceOrder | null;
  parcelEvents: OrderParcelEvent[];
  hasReview: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  loadError: string | null;
  parcelError: string | null;
  orderMutation: OrderMutation;
  isMountedRef: MutableRefObject<boolean>;
  refreshOrder: (isManual?: boolean) => Promise<CommerceOrder | null | undefined>;
  handleCancel: () => Promise<void>;
  handleDeliver: () => Promise<void>;
}

export function useOrderDetail(orderId: string): UseOrderDetailResult {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const { refreshListings } = useBackendData();
  const loadSupportTicketsForOrderFromApi = useStore((state) => state.loadSupportTicketsForOrderFromApi);

  const [backendOrder, setBackendOrder] = useState<CommerceOrder | null>(null);
  const [parcelEvents, setParcelEvents] = useState<OrderParcelEvent[]>([]);
  const [hasReview, setHasReview] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [parcelError, setParcelError] = useState<string | null>(null);
  const [orderMutation, setOrderMutation] = useState<OrderMutation>(null);

  const isMountedRef = useRef(true);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mirror of the last fetched order for use inside stable callbacks. Reading
  // `backendOrder` state directly would make fetchOrder's identity change on
  // every successful fetch — the useFocusEffect below would then re-fire while
  // focused, refetching order + parcels + review in an infinite loop.
  const backendOrderRef = useRef<CommerceOrder | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  // --- Fetch order ---
  const fetchOrder = useCallback(async () => {
    try {
      const order = await getOrder(orderId);
      if (!isMountedRef.current) return;
      backendOrderRef.current = order;
      setBackendOrder(order);
      setLoadError(null);
      return order;
    } catch (error) {
      if (!isMountedRef.current) return;
      if (!backendOrderRef.current) {
        setLoadError(t('orderDetail.error.loadFailed'));
      } else {
        setLoadError(t('orderDetail.error.refreshFailed'));
      }
      return null;
    }
  }, [orderId]);

  // --- Fetch parcel events ---
  const fetchParcelEvents = useCallback(async () => {
    try {
      const events = await getOrderParcelEvents(orderId);
      if (!isMountedRef.current) return;
      setParcelEvents(events);
      setParcelError(null);
    } catch {
      if (!isMountedRef.current) return;
      setParcelError(t('orderDetail.error.trackingUnavailable'));
    }
  }, [orderId]);

  // --- Fetch review state ---
  const fetchReview = useCallback(async () => {
    try {
      const review = await getOrderReview(orderId);
      if (!isMountedRef.current) return;
      setHasReview(review !== null);
    } catch {
      // Review endpoint may not exist for all orders yet; default to false.
      if (!isMountedRef.current) return;
      setHasReview(false);
    }
  }, [orderId]);

  // --- Full refresh ---
  const refreshOrder = useCallback(async (isManual: boolean = false) => {
    if (isManual) {
      setIsRefreshing(true);
    }

    const [orderResult] = await Promise.all([
      fetchOrder(),
      fetchParcelEvents(),
      fetchReview(),
    ]);

    if (!isMountedRef.current) return;

    if (isManual) {
      setIsRefreshing(false);
    } else {
      setIsInitialLoading(false);
    }

    return orderResult;
  }, [fetchOrder, fetchParcelEvents, fetchReview]);

  // --- Focus-aware refresh ---
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        await refreshOrder(false);
        void loadSupportTicketsForOrderFromApi(orderId);
      })();

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      };
    }, [refreshOrder, orderId, loadSupportTicketsForOrderFromApi])
  );

  // --- Polling interval based on order status ---
  useEffect(() => {
    if (!backendOrder) return;

    const normalisedStatus = normaliseOrderStatus(backendOrder.status);
    const isTerminal = isTerminalStatus(normalisedStatus);
    const intervalMs = isTerminal ? 300_000 : 30_000;

    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    refreshIntervalRef.current = setInterval(() => {
      void refreshOrder(false);
    }, intervalMs);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [backendOrder?.status, refreshOrder]);

  // --- Mutation handlers ---

  const handleCancel = useCallback(async () => {
    if (orderMutation) return;
    setOrderMutation('cancel');
    try {
      await cancelOrder(orderId);
      show(t('orderDetail.toast.cancelled'), 'info');
      // Cancelling releases the order's hold on the listing — propagate so
      // the cached listing detail, the seller's listings pages, and the
      // discovery feed show it as available again rather than a stale
      // reserved/sold state.
      if (backendOrder?.listingId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(backendOrder.listingId) });
      }
      if (backendOrder?.sellerId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.user.listingsAll(backendOrder.sellerId) });
      }
      void refreshListings();
      await refreshOrder(false);
    } catch (error) {
      show(parseApiError(error).message, 'error');
    } finally {
      if (isMountedRef.current) setOrderMutation(null);
    }
  }, [orderMutation, orderId, show, refreshOrder, backendOrder, queryClient, refreshListings]);

  const handleDeliver = useCallback(async () => {
    if (orderMutation) return;
    setOrderMutation('deliver');
    try {
      await deliverOrder(orderId);
      show(t('orderDetail.toast.deliveryConfirmed'), 'success');
      await refreshOrder(false);
    } catch (error) {
      show(parseApiError(error).message, 'error');
    } finally {
      if (isMountedRef.current) setOrderMutation(null);
    }
  }, [orderMutation, orderId, show, refreshOrder]);

  return {
    backendOrder,
    parcelEvents,
    hasReview,
    isInitialLoading,
    isRefreshing,
    loadError,
    parcelError,
    orderMutation,
    isMountedRef,
    refreshOrder,
    handleCancel,
    handleDeliver,
  };
}
