import { createContext, useContext, useRef, type ReactNode } from 'react';
import { track } from './track';
import type { EventName, EventProperties } from './types';

type EventPropertyValue = string | number | boolean | null | undefined;

type PropertiesFor<E extends EventName> = E extends keyof EventProperties
  ? EventProperties[E]
  : Record<string, EventPropertyValue>;

export function generateImpressionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function useImpressionId(): string {
  const ref = useRef<string | null>(null);
  if (ref.current === null) {
    ref.current = generateImpressionId();
  }
  return ref.current;
}

export interface ImpressionContextValue {
  impressionId: string;
  surface?: string;
  experimentId?: string;
  variantKey?: string;
}

const ImpressionContext = createContext<ImpressionContextValue | null>(null);

interface ImpressionProviderProps {
  impressionId?: string;
  surface?: string;
  experimentId?: string;
  variantKey?: string;
  children: ReactNode;
}

export function ImpressionProvider({
  impressionId,
  surface,
  experimentId,
  variantKey,
  children,
}: ImpressionProviderProps): React.ReactElement {
  const generatedId = useImpressionId();
  const id = impressionId ?? generatedId;
  const value: ImpressionContextValue = {
    impressionId: id,
    surface,
    experimentId,
    variantKey,
  };
  return <ImpressionContext.Provider value={value}>{children}</ImpressionContext.Provider>;
}

export function useImpressionContext(): ImpressionContextValue | null {
  return useContext(ImpressionContext);
}

export function trackWithImpression<E extends EventName>(
  event: E,
  impressionId: string | null,
  properties?: PropertiesFor<E>,
): void {
  if (!impressionId) {
    track(event, properties);
    return;
  }
  track(event, { ...(properties as Record<string, EventPropertyValue>), impression_id: impressionId } as unknown as PropertiesFor<E>);
}

export function useImpressionTracking(): {
  impressionId: string;
  track: <E extends EventName>(event: E, properties?: PropertiesFor<E>) => void;
} {
  const impressionId = useImpressionId();
  const context = useImpressionContext();
  const effectiveId = context?.impressionId ?? impressionId;

  return {
    impressionId: effectiveId,
    track: <E extends EventName>(event: E, properties?: PropertiesFor<E>) => {
      trackWithImpression(event, effectiveId, properties);
    },
  };
}
