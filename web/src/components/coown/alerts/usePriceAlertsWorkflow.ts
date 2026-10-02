'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import { useCoOwnAssets } from '@/lib/hooks/coown-queries';
import {
  useCoOwnAlertsApi,
  useEvaluateCoOwnAlerts,
  type CoOwnAlert,
} from '../alertStore';

export function usePriceAlertsWorkflow() {
  const router = useRouter();
  const assetsQ = useCoOwnAssets();
  // One API for both backends — server-persisted in live mode, the
  // device store in fixture mode. `ready` is the authoritative-source
  // equivalent of hydration.
  const {
    alerts,
    ready,
    error: alertsError,
    refetch: refetchAlerts,
    source,
    requiresAuth,
    toggleAlert,
    removeAlert,
  } = useCoOwnAlertsApi();
  const { show } = useToast();
  const { requireAuth, wall } = useSignupWall();
  const [pendingDelete, setPendingDelete] = useState<CoOwnAlert | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Fixture-mode evaluator — no-op when the server owns evaluation.
  useEvaluateCoOwnAlerts();

  const titleFor = (assetId: string) =>
    assetsQ.data?.find((a) => a.id === assetId)?.title ?? 'Unknown market';

  const isFired = (a: CoOwnAlert) => a.triggeredAt != null;
  const active = alerts.filter((a) => a.active && !isFired(a));
  const fired = alerts.filter(isFired);
  const paused = alerts.filter((a) => !a.active && !isFired(a));

  // Await the action before toasting — a rolled-back write must surface
  // the failure, never a fabricated success.
  const onToggleAlert = (a: CoOwnAlert) => {
    const wasActive = a.active;
    void toggleAlert(a).then(
      () => show(wasActive ? 'Alert paused' : 'Alert enabled', 'info'),
      (err: unknown) =>
        show(
          err instanceof Error ? err.message : "Couldn't update the alert",
          'error',
        ),
    );
  };

  const handleConfirmDelete = () => {
    const target = pendingDelete;
    if (!target || deleting) return;
    setDeleting(true);
    void removeAlert(target.id)
      .then(() => {
        show('Alert deleted', 'success');
        setPendingDelete(null);
      })
      .catch((err: unknown) =>
        show(
          err instanceof Error ? err.message : "Couldn't delete the alert",
          'error',
        ),
      )
      .finally(() => setDeleting(false));
  };

  return {
    router,
    assetsQ,
    alerts,
    ready,
    alertsError,
    refetchAlerts,
    source,
    requiresAuth,
    requireAuth,
    wall,
    pendingDelete,
    setPendingDelete,
    deleting,
    titleFor,
    active,
    fired,
    paused,
    onToggleAlert,
    handleConfirmDelete,
  };
}
