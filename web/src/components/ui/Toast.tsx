'use client';

/**
 * Toast system — mirrors Toast.tsx: quiet pill bottom-center,
 * success/info/error variants, auto-dismiss. A pill may carry one
 * trailing action (e.g. Undo) — pressing it runs the callback and
 * dismisses the toast early.
 *
 * Auto-dismiss pauses while the toast (or its action) is hovered or
 * focused so the message can't vanish mid-read (WCAG 2.2.1 timing).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Icon } from './Icon';

type ToastKind = 'success' | 'info' | 'error';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
  /** Set by dismiss() — plays toast-exit, then the item unmounts. */
  exiting?: boolean;
}

interface AutoDismissEntry {
  timeoutId: ReturnType<typeof setTimeout> | null;
  /** Milliseconds left before auto-dismiss when paused. */
  remaining: number;
  /** Date.now() at last (re)start — used to compute remaining on pause. */
  startedAt: number;
  /** Active pause reasons ('hover' | 'focus') — timer stays paused while non-empty. */
  pausedBy: Set<'hover' | 'focus'>;
}

/** Matches the toast-exit animation duration in globals.css. */
const EXIT_MS = 160;
const AUTO_DISMISS_MS = 3200;
/** Floor for a resumed timer so a toast can't vanish the instant focus leaves. */
const RESUME_MIN_MS = 1000;

const ToastContext = createContext<{
  show: (message: string, kind?: ToastKind, action?: ToastAction) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  /** Auto-dismiss timers keyed by toast id (pausable). */
  const dismissTimersRef = useRef(new Map<number, AutoDismissEntry>());
  /** Exit-animation timers keyed by toast id. */
  const exitTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    // A manual dismiss cancels any pending auto-dismiss for the toast.
    const pending = dismissTimersRef.current.get(id);
    if (pending) {
      if (pending.timeoutId) clearTimeout(pending.timeoutId);
      dismissTimersRef.current.delete(id);
    }
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, exiting: true } : x)));
    const exitId = setTimeout(() => {
      exitTimersRef.current.delete(id);
      setToasts((t) => t.filter((x) => x.id !== id));
    }, EXIT_MS);
    exitTimersRef.current.set(id, exitId);
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = 'info', action?: ToastAction) => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, message, kind, action }]);
      const timeoutId = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      dismissTimersRef.current.set(id, {
        timeoutId,
        remaining: AUTO_DISMISS_MS,
        startedAt: Date.now(),
        pausedBy: new Set(),
      });
    },
    [dismiss],
  );

  const pauseAutoDismiss = useCallback((id: number, reason: 'hover' | 'focus') => {
    const entry = dismissTimersRef.current.get(id);
    if (!entry) return;
    entry.pausedBy.add(reason);
    if (entry.pausedBy.size > 1) return; // already paused by the other reason
    if (entry.timeoutId) {
      clearTimeout(entry.timeoutId);
      entry.timeoutId = null;
    }
    entry.remaining = Math.max(entry.remaining - (Date.now() - entry.startedAt), 0);
  }, []);

  const resumeAutoDismiss = useCallback(
    (id: number, reason: 'hover' | 'focus') => {
      const entry = dismissTimersRef.current.get(id);
      if (!entry) return;
      entry.pausedBy.delete(reason);
      if (entry.pausedBy.size > 0 || entry.timeoutId) return;
      entry.remaining = Math.max(entry.remaining, RESUME_MIN_MS);
      entry.startedAt = Date.now();
      entry.timeoutId = setTimeout(() => dismiss(id), entry.remaining);
    },
    [dismiss],
  );

  // Provider unmount: no timer may outlive the tree it mutates.
  useEffect(() => {
    const dismissTimers = dismissTimersRef.current;
    const exitTimers = exitTimersRef.current;
    return () => {
      dismissTimers.forEach((e) => {
        if (e.timeoutId) clearTimeout(e.timeoutId);
      });
      dismissTimers.clear();
      exitTimers.forEach((id) => clearTimeout(id));
      exitTimers.clear();
    };
  }, []);

  // Stable context value — consumers don't re-render when toasts change.
  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-toast flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            onMouseEnter={() => pauseAutoDismiss(t.id, 'hover')}
            onMouseLeave={() => resumeAutoDismiss(t.id, 'hover')}
            onFocus={() => pauseAutoDismiss(t.id, 'focus')}
            onBlur={() => resumeAutoDismiss(t.id, 'focus')}
            className={`${t.exiting ? 'toast-exit' : 'toast-enter'} pointer-events-auto flex items-center gap-2 rounded-full bg-surface-elevated px-4 py-2.5 text-body font-medium text-text-primary shadow-modal border border-border`}
          >
            {t.kind === 'success' ? (
              <Icon name="check" filled size={16} className="text-success-text" />
            ) : t.kind === 'error' ? (
              <Icon name="alert" size={16} className="text-danger-text" />
            ) : (
              <Icon name="info" size={16} className="text-text-secondary" />
            )}
            {t.message}
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  t.action?.onPress();
                  dismiss(t.id);
                }}
                className="pressable -my-1 -mr-1.5 ml-1 rounded-full px-2 py-1 font-semibold text-brand"
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
