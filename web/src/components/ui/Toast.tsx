'use client';

/**
 * Toast system — mirrors Toast.tsx: quiet pill bottom-center,
 * success/info/error variants, auto-dismiss. A pill may carry one
 * trailing action (e.g. Undo) — pressing it runs the callback and
 * dismisses the toast early.
 */

import { createContext, useCallback, useContext, useRef, useState } from 'react';
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

/** Matches the toast-exit animation duration in globals.css. */
const EXIT_MS = 160;

const ToastContext = createContext<{
  show: (message: string, kind?: ToastKind, action?: ToastAction) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, exiting: true } : x)));
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, EXIT_MS);
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = 'info', action?: ToastAction) => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, message, kind, action }]);
      setTimeout(() => dismiss(id), 3200);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-toast flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`${t.exiting ? 'toast-exit' : 'toast-enter'} flex items-center gap-2 rounded-full bg-surface-elevated px-4 py-2.5 text-body font-medium text-text-primary shadow-modal border border-border`}
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
                className="pressable pointer-events-auto -my-1 -mr-1.5 ml-1 rounded-full px-2 py-1 font-semibold text-brand"
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
