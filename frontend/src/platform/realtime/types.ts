/**
 * Realtime platform types — mirrors the backend `RealtimeEnvelope` schema.
 *
 * @see backend/api/src/lib/realtime.ts — RealtimeEnvelope
 */

/** Per-topic monotonically increasing sequence number (0 = legacy/unset). */
export type SequenceNumber = number;

/**
 * Wire format for all realtime events, matching the backend envelope.
 * Every event has a topic, type, payload, timestamp, and optional seq/v.
 */
export interface RealtimeEnvelope<TPayload = Record<string, unknown>> {
  id: string;
  topic: string;
  type: string;
  payload: TPayload;
  timestamp: string;
  /** Per-topic monotonic sequence — used for gap detection on reconnect. */
  seq?: SequenceNumber;
  /** Payload schema version — clients ignore unknown versions gracefully. */
  v?: number;
}

/** Control messages sent from the client to the server. */
export type RealtimeControlMessage =
  | { action: 'subscribe'; topics: string[] }
  | { action: 'unsubscribe'; topics: string[] };

/** System event types sent by the server (not user-facing topics). */
export type SystemEventType =
  | 'connected'
  | 'heartbeat'
  | 'subscription_ack'
  | 'warning';

/** Connection state machine. */
export type RealtimeConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

/** Event handler for realtime events on a specific topic. */
export type RealtimeEventHandler<TPayload = Record<string, unknown>> = (
  envelope: RealtimeEnvelope<TPayload>,
) => void;

/** Event handler for connection state changes. */
export type ConnectionStateHandler = (state: RealtimeConnectionState) => void;

/** Result of a gap-replay request. */
export interface ReplayResult {
  ok: boolean;
  topic: string;
  canReplay: boolean;
  currentSeq: SequenceNumber;
  events: RealtimeEnvelope[];
}

/** Result of a sequence-check request. */
export interface SequenceCheckResult {
  ok: boolean;
  topic: string;
  seq: SequenceNumber;
}

/** Configuration for the realtime client. */
export interface RealtimeClientConfig {
  /** Base URL for the API (e.g. "https://api.thryftverse.com"). */
  apiUrl: string;
  /** Async function returning the current access token (for auth). */
  getAccessToken: () => Promise<string | null>;
  /** Initial topics to subscribe to on connect. */
  initialTopics?: string[];
  /** Base reconnection delay in ms (default 500). */
  reconnectBaseDelayMs?: number;
  /** Maximum reconnection delay in ms (default 30_000). */
  reconnectMaxDelayMs?: number;
  /** Heartbeat timeout in ms — if no message received in this window, consider the connection dead (default 75_000). */
  heartbeatTimeoutMs?: number;
  /** Whether to enable automatic gap replay on reconnect (default true). */
  enableGapReplay?: boolean;
  /** Optional storage for persisting last-seen sequence numbers across app restarts. */
  sequenceStorage?: {
    get: (topic: string) => SequenceNumber | undefined;
    set: (topic: string, seq: SequenceNumber) => void;
  };
}
