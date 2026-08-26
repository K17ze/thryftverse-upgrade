import { useState, useCallback, useRef, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
import { parseApiError } from '../lib/apiClient';
import { t } from '../i18n';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';

export type OrderMutation = 'cancel' | 'ship' | 'deliver' | 'refund' | null;

export interface UseOrderDetailResult {
  backendOrder: CommerceOrder | null;
  parcelEvents: OrderParcelEvent[];
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
  const loadSupportTicketsForOrderFromApi = useStore((state) => state.loadSupportTicketsForOrderFromApi);

  const [backendOrder, setBackendOrder] = useState<CommerceOrder | null>(null);
  const [parcelEvents, setParcelEvents] = useState<OrderParcelEvent[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [parcelError, setParcelError] = useState<string | null>(null);
  const [orderMutation, setOrderMutation] = useState<OrderMutation>(null);

  const isMountedRef = useRef(true);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      setBackendOrder(order);
      setLoadError(null);
      return order;
    } catch (error) {
      if (!isMountedRef.current) return;
      if (!backendOrder) {
        setLoadError(t('orderDetail.error.loadFailed'));
      } else {
        setLoadError(t('orderDetail.error.refreshFailed'));
      }
      return null;
    }
  }, [orderId, backendOrder]);

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

  // --- Full refresh ---
  const refreshOrder = useCallback(async (isManual: boolean = false) => {
    if (isManual) {
      setIsRefreshing(true);
    }

    const [orderResult] = await Promise.all([
      fetchOrder(),
      fetchParcelEvents(),
    ]);

    if (!isMountedRef.current) return;

    if (isManual) {
      setIsRefreshing(false);
    } else {
      setIsInitialLoading(false);
    }

    return orderResult;
  }, [fetchOrder, fetchParcelEvents]);

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
      await refreshOrder(false);
    } catch (error) {
      show(parseApiError(error).message, 'error');
    } finally {
      if (isMountedRef.current) setOrderMutation(null);
    }
  }, [orderMutation, orderId, show, refreshOrder]);

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
