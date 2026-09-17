import { useEffect } from 'react';
import { getSharedManager } from '../../core/upload/useUploadManager';
import { useToast } from '../../../context/ToastContext';

// ── Upload reconciliation on startup ────────────────────────────────
// Rehydrate any persisted upload jobs and re-queue work that was
// interrupted by a process death. Runs once when the creator context
// mounts. Only surfaces a toast when jobs were actually recovered so
// the user isn't spammed with "0 uploads resumed" on every open.
export function useUploadReconcile(): void {
  const toast = useToast();
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { resumedCount } = await getSharedManager().reconcileOnStartup();
        if (!cancelled && resumedCount > 0) {
          toast.show(`Resumed ${resumedCount} upload${resumedCount === 1 ? '' : 's'}`, 'info');
        }
      } catch {
        // Reconciliation is best-effort — never block the composer on a
        // store hydration failure.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
