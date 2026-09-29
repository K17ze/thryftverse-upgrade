'use client';

/**
 * Co-Own price alerts — persisted locally and evaluated for real on this
 * device. `evaluateAlerts(prices)` runs against the last-trade price the
 * coown queries return (fixtures, or the live surface), so an alert fires
 * the moment a session fill pushes the market through its target. A fired
 * alert deactivates and carries `triggeredAt` — one-shot, like the mobile
 * contract. There is no push delivery: the state lives on this device and
 * the Alerts surface is where it surfaces.
 *
 * Kept beside the feature components rather than in lib/store so the
 * persisted slice stays inside the coown ownership boundary.
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StoredPriceAlert } from '@/lib/contracts/coown';
import { coOwnMarkGbp } from '@/lib/contracts/coown';
import { DATA_MODE } from '@/lib/api/client';
import {
  useCoOwnAssets,
  useCoOwnPriceAlertActions,
  useCoOwnPriceAlerts,
} from '@/lib/hooks/coown-queries';
import { useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';

/** Wire shape plus the local fired state — `triggeredAt` stays client-only. */
export type CoOwnAlert = StoredPriceAlert & { triggeredAt?: string | null };

interface PriceAlertsState {
  alerts: CoOwnAlert[];
  createAlert: (input: {
    assetId: string;
    direction: 'above' | 'below';
    targetPriceGbp: number;
  }) => CoOwnAlert;
  toggleAlert: (id: string) => void;
  removeAlert: (id: string) => void;
  /**
   * Evaluate every armed alert against the latest last-trade prices.
   * Idempotent — safe to run on every assets snapshot.
   */
  evaluateAlerts: (prices: Record<string, number>) => void;
}

let counter = 0;
const nextId = () =>
  `pa-${Date.now().toString(36)}-${(counter++).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;

export const useCoOwnAlerts = create<PriceAlertsState>()(
  persist(
    (set) => ({
      // Honest start: no seeded alerts — every row here is one the
      // viewer actually created. A fresh user gets the empty state.
      alerts: [],
      createAlert: ({ assetId, direction, targetPriceGbp }) => {
        const alert: CoOwnAlert = {
          id: nextId(),
          assetId,
          direction,
          targetPriceGbp,
          active: true,
          triggeredAt: null,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ alerts: [alert, ...s.alerts] }));
        return alert;
      },
      toggleAlert: (id) =>
        set((s) => ({
          alerts: s.alerts.map((a) =>
            a.id === id ? { ...a, active: !a.active } : a,
          ),
        })),
      removeAlert: (id) =>
        set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
      evaluateAlerts: (prices) =>
        set((s) => {
          let changed = false;
          const alerts = s.alerts.map((a) => {
            if (!a.active || a.triggeredAt) return a;
            const price = prices[a.assetId];
            if (price == null) return a;
            const hit =
              a.direction === 'above'
                ? price >= a.targetPriceGbp
                : price <= a.targetPriceGbp;
            if (!hit) return a;
            changed = true;
            return { ...a, active: false, triggeredAt: new Date().toISOString() };
          });
          return changed ? { alerts } : s;
        }),
    }),
    {
      name: 'thryftverse.web.coown-alerts',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ alerts: s.alerts }),
    },
  ),
);

/**
 * The evaluator — mount this on any surface that should advance alerts.
 * Feeds the store every assets snapshot; fixture fills written by the
 * trading mutation flow through the same query data, so session trades
 * can cross a target. No-op in live mode — the server evaluates alerts
 * and delivers notifications itself.
 */
export function useEvaluateCoOwnAlerts() {
  const { data: assets } = useCoOwnAssets();
  const evaluateAlerts = useCoOwnAlerts((s) => s.evaluateAlerts);
  useEffect(() => {
    if (DATA_MODE === 'live' || !assets) return;
    // Alerts evaluate against the market mark — the last settled trade
    // where the market has printed, else the issue price.
    evaluateAlerts(Object.fromEntries(assets.map((a) => [a.id, coOwnMarkGbp(a)])));
  }, [assets, evaluateAlerts]);
}

/**
 * Mode-aware alert API — one surface for both backends.
 * Live mode: the backend is the source of truth (cross-device, server-
 * evaluated). Fixture mode: the persisted device store — the same rows
 * the evaluator fires locally. Components never branch on DATA_MODE.
 */
export function useCoOwnAlertsApi() {
  const storedAlerts = useCoOwnAlerts((s) => s.alerts);
  const createLocal = useCoOwnAlerts((s) => s.createAlert);
  const toggleLocal = useCoOwnAlerts((s) => s.toggleAlert);
  const removeLocal = useCoOwnAlerts((s) => s.removeAlert);
  const hydrated = useHydrated();
  const liveQuery = useCoOwnPriceAlerts();
  const liveActions = useCoOwnPriceAlertActions();
  const { isGuest } = useSession();

  if (DATA_MODE === 'live') {
    // Guests can't hold server-side alerts — `requiresAuth` lets the
    // surface render the sign-in path instead of a skeleton that
    // never resolves (the query stays disabled while signed out).
    return {
      alerts: (liveQuery.data ?? []) as CoOwnAlert[],
      ready: isGuest || liveQuery.data !== undefined,
      requiresAuth: isGuest,
      source: 'server' as const,
      createAlert: async (input: {
        assetId: string;
        direction: 'above' | 'below';
        targetPriceGbp: number;
      }) => liveActions.createAlert(input),
      // The backend re-arms a fired alert on activate (triggered_at
      // clears server-side) — pass the row, not just the id.
      toggleAlert: (alert: CoOwnAlert) =>
        void liveActions.toggleAlert({
          ...alert,
          triggeredAt: alert.triggeredAt ?? null,
        }),
      removeAlert: (id: string) => void liveActions.removeAlert(id),
    };
  }

  return {
    alerts: hydrated ? storedAlerts : [],
    ready: hydrated,
    requiresAuth: false,
    source: 'device' as const,
    createAlert: async (input: {
      assetId: string;
      direction: 'above' | 'below';
      targetPriceGbp: number;
    }) => {
      createLocal(input);
      return true;
    },
    toggleAlert: (alert: CoOwnAlert) => toggleLocal(alert.id),
    removeAlert: (id: string) => removeLocal(id),
  };
}
