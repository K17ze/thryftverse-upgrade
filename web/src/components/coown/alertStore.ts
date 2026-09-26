'use client';

/**
 * Co-Own price alerts — persisted locally until the alert evaluator lands.
 * Mirrors the mobile contract (condition above/below on last-trade price);
 * created on the asset detail, managed on /co-own/alerts.
 * Kept beside the feature components rather than in lib/store so the
 * persisted slice stays inside the coown ownership boundary.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StoredPriceAlert } from '@/lib/contracts/coown';
import { PRICE_ALERT_SEED } from '@/lib/data/fixtures-coown';

interface PriceAlertsState {
  alerts: StoredPriceAlert[];
  createAlert: (input: {
    assetId: string;
    direction: 'above' | 'below';
    targetPriceGbp: number;
  }) => StoredPriceAlert;
  toggleAlert: (id: string) => void;
  removeAlert: (id: string) => void;
}

let counter = 0;
const nextId = () =>
  `pa-${Date.now().toString(36)}-${(counter++).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;

export const useCoOwnAlerts = create<PriceAlertsState>()(
  persist(
    (set) => ({
      alerts: PRICE_ALERT_SEED,
      createAlert: ({ assetId, direction, targetPriceGbp }) => {
        const alert: StoredPriceAlert = {
          id: nextId(),
          assetId,
          direction,
          targetPriceGbp,
          active: true,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ alerts: [alert, ...s.alerts] }));
        return alert;
      },
      toggleAlert: (id) =>
        set((s) => ({
          alerts: s.alerts.map((a) => (a.id === id ? { ...a, active: !a.active } : a)),
        })),
      removeAlert: (id) =>
        set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
    }),
    {
      name: 'thryftverse.web.coown-alerts',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ alerts: s.alerts }),
    },
  ),
);
