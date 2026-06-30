import { useEffect, useRef, useCallback } from 'react';
import type { DependencyList } from 'react';

export interface UseUnsavedFormGuardOptions {
  isDirty: boolean;
  onAttemptLeave?: () => void;
  enabled?: boolean;
}

export function useUnsavedFormGuard({
  isDirty,
  onAttemptLeave,
  enabled = true,
}: UseUnsavedFormGuardOptions) {
  const isDirtyRef = useRef(isDirty);
  const onAttemptLeaveRef = useRef(onAttemptLeave);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    onAttemptLeaveRef.current = onAttemptLeave;
  }, [onAttemptLeave]);

  const checkBeforeLeave = useCallback((): boolean => {
    if (isDirtyRef.current && enabled) {
      onAttemptLeaveRef.current?.();
      return false;
    }
    return true;
  }, [enabled]);

  return { checkBeforeLeave, isDirty };
}
