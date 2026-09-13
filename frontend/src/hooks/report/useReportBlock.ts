import { useCallback, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { blockUser } from '../../services/profileApi';
import { useStore } from '../../store/useStore';

export interface UseReportBlockResult {
  isBlocked: boolean;
  isBlocking: boolean;
  hasBlocked: boolean;
  blockTarget: () => Promise<void>;
}

/**
 * Block-after-report flow for ReportScreen. `addBlockedUser` is committed
 * only after the `blockUser` API call resolves — keeps the store in sync
 * with the backend block.
 */
export function useReportBlock(targetId: string | undefined): UseReportBlockResult {
  const { show } = useToast();
  const { t } = useAppTranslation('report');
  const addBlockedUser = useStore((s) => s.addBlockedUser);
  const isBlocked = useStore((s) =>
    targetId ? s.blockedUsers.includes(targetId) : false
  );
  const [isBlocking, setIsBlocking] = useState(false);
  const [hasBlocked, setHasBlocked] = useState(false);

  const blockTarget = useCallback(async () => {
    if (!targetId || isBlocking || hasBlocked || isBlocked) return;
    setIsBlocking(true);
    try {
      await blockUser(targetId);
      addBlockedUser(targetId);
      setHasBlocked(true);
      show(t('toast.accountBlocked'), 'success');
    } catch {
      show(t('toast.blockFailed'), 'error');
    } finally {
      setIsBlocking(false);
    }
  }, [targetId, isBlocking, hasBlocked, isBlocked, addBlockedUser, show, t]);

  return { isBlocked, isBlocking, hasBlocked, blockTarget };
}
