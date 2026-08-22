/**
 * Realtime platform module — barrel export for the WebSocket realtime client.
 *
 * Provides a typed WebSocket client that connects to the backend's realtime
 * system (/realtime/ws), with automatic reconnection, gap detection, and
 * event replay.
 *
 * @see ./RealtimeClient.ts — the core client class
 * @see ./RealtimeProvider.tsx — React context provider
 * @see ./useRealtimeEvent.ts — React hooks for subscribing to events
 */
export { RealtimeClient } from './RealtimeClient';
export { RealtimeProvider, useRealtime } from './RealtimeProvider';
export type { RealtimeProviderProps } from './RealtimeProvider';
export {
  useRealtimeEvent,
  useRealtimeEventHistory,
  useRealtimeResnapshot,
} from './useRealtimeEvent';
export type {
  RealtimeEnvelope,
  RealtimeControlMessage,
  RealtimeConnectionState,
  RealtimeEventHandler,
  ConnectionStateHandler,
  SequenceNumber,
  ReplayResult,
  SequenceCheckResult,
  RealtimeClientConfig,
} from './types';
