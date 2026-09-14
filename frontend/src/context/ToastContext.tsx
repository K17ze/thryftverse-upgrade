import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { AccessibilityInfo } from 'react-native';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastOptions {
  /**
   * Single quiet CTA rendered inline in the toast (e.g. "Add to a list").
   * Tapping it runs `onPress` and dismisses the toast. Keep to one action —
   * a toast is a hint, not a dialog.
   */
  action?: ToastAction;
  /**
   * Fires only when the user explicitly dismisses via the close button —
   * never on auto-dismiss, so callers can tell "seen and waved away" apart
   * from "timed out unnoticed".
   */
  onDismiss?: () => void;
  /**
   * Total on-screen lifetime in ms. Defaults to 3500; 5600 when an action
   * is present so the CTA stays reachable.
   */
  durationMs?: number;
}

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
  onDismiss?: () => void;
  durationMs: number;
}

interface ToastContextType {
  show: (message: string, type?: ToastType, options?: ToastOptions) => void;
  toasts: ToastItem[];
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  show: () => {},
  toasts: [],
  dismiss: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const show = useCallback((message: string, type: ToastType = 'info', options?: ToastOptions) => {
    const id = `${Date.now()}-${Math.random()}`;
    const durationMs = options?.durationMs ?? (options?.action ? 5600 : 3500);
    setToasts(prev => [...prev.slice(-2), {
      id,
      message,
      type,
      action: options?.action,
      onDismiss: options?.onDismiss,
      durationMs }]);

    if (typeof AccessibilityInfo?.announceForAccessibility === 'function') {
      void AccessibilityInfo.announceForAccessibility(message);
    }

    timers.current[id] = setTimeout(() => dismiss(id), durationMs);
  }, [dismiss]);

  const value = useMemo(() => ({ show, toasts, dismiss }), [show, toasts, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  );
}