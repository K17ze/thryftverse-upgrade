/**
 * RealtimeClient — frontend WebSocket client for the ThryftVerse realtime system.
 *
 * Connects to the backend's `/realtime/ws` endpoint and provides:
 *   - Automatic reconnection with exponential backoff + jitter
 *   - Per-topic sequence tracking for gap detection
 *   - Automatic gap replay on reconnect (via `/realtime/replay`)
 *   - Dynamic topic subscription / unsubscription
 *   - Heartbeat-based dead-connection detection
 *   - EventEmitter pattern for topic-scoped event dispatch
 *
 * Architecture:
 *   The backend (backend/api/src/lib/realtime.ts) maintains per-topic
 *   monotonic sequence numbers and a 200-event ring buffer per topic.
 *   On reconnect, this client:
 *     1. Re-subscribes to all active topics
 *     2. For each topic, checks `/realtime/seq` for the current sequence
 *     3. If there's a gap (currentSeq > lastSeenSeq), calls `/realtime/replay`
 *     4. If replay succeeds, dispatches missed events to handlers
 *     5. If replay fails (gap too large), emits a `resnapshot` signal
 *
 * Heartbeat:
 *   The backend sends a heartbeat every 25s. If this client receives no
 *   message (heartbeat or otherwise) within `heartbeatTimeoutMs` (default 75s),
 *   it considers the connection dead and forces a reconnect. This catches
 *   half-open TCP connections where `onclose` doesn't fire.
 *
 * @see backend/api/src/lib/realtime.ts
 * @see backend/api/src/routes/realtime.ts
 */
import { Platform } from 'react-native';
import {
  type RealtimeClientConfig,
  type RealtimeEnvelope,
  type RealtimeControlMessage,
  type RealtimeConnectionState,
  type RealtimeEventHandler,
  type ConnectionStateHandler,
  type SequenceNumber,
  type ReplayResult,
  type SequenceCheckResult,
} from './types';

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_RECONNECT_BASE_DELAY_MS = 500;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 75_000;
const MAX_RECONNECT_ATTEMPTS = 50;

// ── Utility ────────────────────────────────────────────────────────

/** Full-jitter exponential backoff: delay = min(base * 2^attempt, max) * random(0, 1). */
function computeBackoffDelay(
  attempt: number,
  baseMs: number,
  maxMs: number,
): number {
  const exponential = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  return Math.floor(exponential * Math.random());
}

/** Convert an HTTP API base URL to a WebSocket URL. */
function apiUrlToWsUrl(apiUrl: string, path: string, queryParams: Record<string, string>): string {
  let url = apiUrl;
  if (url.startsWith('https://')) {
    url = `wss://${url.slice(8)}`;
  } else if (url.startsWith('http://')) {
    url = `ws://${url.slice(7)}`;
  }
  const qs = Object.entries(queryParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${url}${path}${qs ? `?${qs}` : ''}`;
}

// ── Event emitter (topic-scoped) ───────────────────────────────────

type TopicListeners = Map<string, Set<RealtimeEventHandler>>;
type StateListeners = Set<ConnectionStateHandler>;
type ResnapshotListeners = Set<(topic: string) => void>;

// ── Client ─────────────────────────────────────────────────────────

export class RealtimeClient {
  private config: Required<Omit<RealtimeClientConfig, 'sequenceStorage'>> &
    Pick<RealtimeClientConfig, 'sequenceStorage'>;

  private ws: WebSocket | null = null;
  private state: RealtimeConnectionState = 'idle';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private isIntentionallyClosed = false;

  /** Topics the client wants to be subscribed to. */
  private desiredTopics: Set<string>;
  /** Topics the server has confirmed subscription for. */
  private subscribedTopics: Set<string> = new Set();
  /** Last seen sequence number per topic (for gap detection). */
  private lastSeenSeq: Map<string, SequenceNumber> = new Map();

  // Event listeners
  private topicListeners: TopicListeners = new Map();
  private stateListeners: StateListeners = new Set();
  private resnapshotListeners: ResnapshotListeners = new Set();

  constructor(config: RealtimeClientConfig) {
    this.config = {
      apiUrl: config.apiUrl,
      getAccessToken: config.getAccessToken,
      initialTopics: config.initialTopics ?? [],
      reconnectBaseDelayMs: config.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS,
      reconnectMaxDelayMs: config.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS,
      heartbeatTimeoutMs: config.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS,
      enableGapReplay: config.enableGapReplay ?? true,
      sequenceStorage: config.sequenceStorage,
    };
    this.desiredTopics = new Set(this.config.initialTopics);
  }

  // ── Public API ───────────────────────────────────────────────────

  /** Current connection state. */
  getState(): RealtimeConnectionState {
    return this.state;
  }

  /** Topics the client is currently subscribed to (server-confirmed). */
  getSubscribedTopics(): string[] {
    return Array.from(this.subscribedTopics);
  }

  /** Open the WebSocket connection. No-op if already connected. */
  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }
    this.isIntentionallyClosed = false;
    await this.openSocket();
  }

  /** Close the connection and stop reconnection. */
  disconnect(): void {
    this.isIntentionallyClosed = true;
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.close(1000, 'client_disconnect');
      } catch {
        // Ignore close errors.
      }
      this.ws = null;
    }
    this.setState('disconnected');
    this.subscribedTopics.clear();
  }

  /** Subscribe to additional topics (sends control message if connected). */
  subscribe(topics: string[]): void {
    for (const t of topics) {
      this.desiredTopics.add(t);
    }
    if (this.state === 'connected') {
      this.sendControl({ action: 'subscribe', topics });
    }
  }

  /** Unsubscribe from topics (sends control message if connected). */
  unsubscribe(topics: string[]): void {
    for (const t of topics) {
      this.desiredTopics.delete(t);
    }
    if (this.state === 'connected') {
      this.sendControl({ action: 'unsubscribe', topics });
      for (const t of topics) {
        this.subscribedTopics.delete(t);
      }
    }
  }

  /**
   * Register a handler for events on a specific topic.
   * Returns an unsubscribe function.
   */
  on<TPayload = Record<string, unknown>>(
    topic: string,
    handler: RealtimeEventHandler<TPayload>,
  ): () => void {
    let listeners = this.topicListeners.get(topic);
    if (!listeners) {
      listeners = new Set();
      this.topicListeners.set(topic, listeners);
    }
    listeners.add(handler as RealtimeEventHandler);
    return () => {
      listeners?.delete(handler as RealtimeEventHandler);
      if (listeners && listeners.size === 0) {
        this.topicListeners.delete(topic);
      }
    };
  }

  /** Register a handler for connection state changes. */
  onStateChange(handler: ConnectionStateHandler): () => void {
    this.stateListeners.add(handler);
    return () => {
      this.stateListeners.delete(handler);
    };
  }

  /**
   * Register a handler for the "resnapshot" signal — emitted when a
   * sequence gap is too large to replay and the client should refetch
   * the canonical state for that topic (e.g., re-fetch auction detail).
   */
  onResnapshot(handler: (topic: string) => void): () => void {
    this.resnapshotListeners.add(handler);
    return () => {
      this.resnapshotListeners.delete(handler);
    };
  }

  // ── Internal: connection lifecycle ───────────────────────────────

  private async openSocket(): Promise<void> {
    this.setState(this.reconnectAttempt === 0 ? 'connecting' : 'reconnecting');

    const token = await this.config.getAccessToken();
    if (!token) {
      // No auth token — can't connect. Will retry on next connect() call.
      this.setState('disconnected');
      return;
    }

    const topics = Array.from(this.desiredTopics);
    const url = apiUrlToWsUrl(this.config.apiUrl, '/realtime/ws', {
      topics: topics.join(','),
    });

    // React Native WebSocket supports custom headers via the second argument
    // at runtime (headers are supported natively since RN 0.63), but the TS
    // type definitions only declare `string | string[]` for protocols. We
    // cast to bypass the type limitation for the native headers extension.
    const wsHeaders: { headers?: Record<string, string> } = {};
    if (Platform.OS !== 'web') {
      wsHeaders.headers = { Authorization: `Bearer ${token}` };
    }

    let socket: WebSocket;
    try {
      // On web, pass undefined (no protocols). On native, pass the headers
      // object cast to the protocol type — RN's WebSocket implementation
      // accepts an object with `headers` as the second argument.
      socket = new WebSocket(
        url,
        Platform.OS !== 'web'
          ? (wsHeaders as unknown as string | string[])
          : undefined,
      );
    } catch (error) {
      this.handleSocketError(error);
      return;
    }

    this.ws = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.setState('connected');
      this.startHeartbeatTimer();
      // The server sends a 'connected' event with the confirmed topic list.
      // We don't need to send initial subscribe — topics are in the query string.
    };

    socket.onmessage = (event: WebSocketMessageEvent) => {
      this.resetHeartbeatTimer();
      this.handleMessage(event.data);
    };

    socket.onerror = () => {
      // Errors are usually followed by onclose, which triggers reconnection.
      // We don't setState here to avoid flicker.
    };

    socket.onclose = (event: CloseEvent) => {
      this.ws = null;
      this.clearHeartbeatTimer();
      this.subscribedTopics.clear();

      if (this.isIntentionallyClosed) {
        this.setState('disconnected');
        return;
      }

      // 4401 = unauthorized — don't attempt reconnection (token is invalid).
      if (event.code === 4401) {
        this.setState('disconnected');
        return;
      }

      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.isIntentionallyClosed) return;
    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this.setState('disconnected');
      return;
    }

    const delay = computeBackoffDelay(
      this.reconnectAttempt,
      this.config.reconnectBaseDelayMs,
      this.config.reconnectMaxDelayMs,
    );
    this.reconnectAttempt += 1;
    this.setState('reconnecting');

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket();
    }, delay);
  }

  private handleSocketError(error: unknown): void {
    // Schedule a reconnect after a socket creation failure.
    this.ws = null;
    if (this.isIntentionallyClosed) {
      this.setState('disconnected');
      return;
    }
    this.scheduleReconnect();
  }

  // ── Internal: message handling ───────────────────────────────────

  private handleMessage(rawData: WebSocketMessageEvent['data']): void {
    if (typeof rawData !== 'string') return;

    let envelope: RealtimeEnvelope;
    try {
      envelope = JSON.parse(rawData) as RealtimeEnvelope;
    } catch {
      return; // Malformed JSON — ignore.
    }

    // Track sequence number for gap detection.
    if (envelope.seq != null && envelope.seq > 0) {
      const prev = this.lastSeenSeq.get(envelope.topic) ?? 0;
      if (envelope.seq > prev) {
        this.lastSeenSeq.set(envelope.topic, envelope.seq);
        this.config.sequenceStorage?.set(envelope.topic, envelope.seq);
      }
    }

    // Handle system events.
    if (envelope.topic === 'system') {
      this.handleSystemEvent(envelope);
      return;
    }

    // Dispatch to topic listeners.
    const listeners = this.topicListeners.get(envelope.topic);
    if (listeners) {
      for (const handler of listeners) {
        try {
          handler(envelope);
        } catch {
          // Handler errors don't break the dispatch loop.
        }
      }
    }
  }

  private handleSystemEvent(envelope: RealtimeEnvelope): void {
    switch (envelope.type) {
      case 'connected': {
        // Server confirmed connection. Update subscribed topics from payload.
        const topics = (envelope.payload as { topics?: string[] }).topics;
        if (Array.isArray(topics)) {
          this.subscribedTopics = new Set(topics);
        }
        // After (re)connection, check for gaps and request replay.
        if (this.config.enableGapReplay) {
          void this.checkAndReplayGaps();
        }
        break;
      }
      case 'subscription_ack': {
        const payload = envelope.payload as {
          action: string;
          topics: string[];
          acceptedTopics: string[];
          rejectedTopics: string[];
        };
        if (payload.action === 'subscribe') {
          for (const t of payload.acceptedTopics) {
            this.subscribedTopics.add(t);
          }
        } else if (payload.action === 'unsubscribe') {
          for (const t of payload.topics) {
            this.subscribedTopics.delete(t);
          }
        }
        break;
      }
      case 'heartbeat':
        // Heartbeat received — connection is alive. Timer already reset.
        break;
      case 'warning':
        // Server sent a warning (e.g., malformed control message). Ignore.
        break;
    }
  }

  // ── Internal: gap detection & replay ─────────────────────────────

  /**
   * After reconnecting, check each subscribed topic for sequence gaps.
   * If the server's current sequence is ahead of our last-seen sequence,
   * request a replay of missed events. If the gap is too large (buffer
   * overflow), emit a `resnapshot` signal so the caller can refetch.
   */
  private async checkAndReplayGaps(): Promise<void> {
    const token = await this.config.getAccessToken();
    if (!token) return;

    for (const topic of this.subscribedTopics) {
      if (topic === 'system' || topic === '*') continue;

      // Restore from persistent storage if available.
      const lastSeen =
        this.lastSeenSeq.get(topic) ??
        this.config.sequenceStorage?.get(topic) ??
        0;
      this.lastSeenSeq.set(topic, lastSeen);

      try {
        // Check current sequence on the server.
        const seqResult = await this.fetchSequenceCheck(topic, token);
        if (!seqResult.ok) continue;

        if (seqResult.seq <= lastSeen) continue; // No gap.

        // Gap detected — request replay.
        const replayResult = await this.fetchReplay(topic, lastSeen, token);
        if (!replayResult.ok) continue;

        if (!replayResult.canReplay) {
          // Gap too large — emit resnapshot signal.
          this.resnapshotListeners.forEach((handler) => {
            try {
              handler(topic);
            } catch {
              // Ignore handler errors.
            }
          });
          // Update last-seen to current so we don't re-emit on next check.
          this.lastSeenSeq.set(topic, replayResult.currentSeq);
          this.config.sequenceStorage?.set(topic, replayResult.currentSeq);
          continue;
        }

        // Dispatch replayed events to listeners.
        for (const event of replayResult.events) {
          if (event.seq != null && event.seq > lastSeen) {
            this.lastSeenSeq.set(topic, event.seq);
            this.config.sequenceStorage?.set(topic, event.seq);
          }
          const listeners = this.topicListeners.get(topic);
          if (listeners) {
            for (const handler of listeners) {
              try {
                handler(event);
              } catch {
                // Ignore handler errors.
              }
            }
          }
        }
      } catch {
        // Network error during gap check — non-fatal, events will resume.
      }
    }
  }

  private async fetchSequenceCheck(
    topic: string,
    token: string,
  ): Promise<SequenceCheckResult> {
    const url = `${this.config.apiUrl}/realtime/seq?topic=${encodeURIComponent(topic)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return { ok: false, topic, seq: 0 };
    }
    const data = (await response.json()) as SequenceCheckResult;
    return data;
  }

  private async fetchReplay(
    topic: string,
    fromSeq: SequenceNumber,
    token: string,
  ): Promise<ReplayResult> {
    const url =
      `${this.config.apiUrl}/realtime/replay` +
      `?topic=${encodeURIComponent(topic)}&fromSeq=${fromSeq}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return { ok: false, topic, canReplay: false, currentSeq: 0, events: [] };
    }
    const data = (await response.json()) as ReplayResult;
    return data;
  }

  // ── Internal: control messages ───────────────────────────────────

  private sendControl(message: RealtimeControlMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(message));
    } catch {
      // Socket may have closed between the readyState check and the send.
    }
  }

  // ── Internal: heartbeat ──────────────────────────────────────────

  private startHeartbeatTimer(): void {
    this.clearHeartbeatTimer();
    this.heartbeatTimer = setTimeout(() => {
      // No message received within the heartbeat window — connection is
      // likely half-open. Force-close to trigger reconnection.
      this.forceClose();
    }, this.config.heartbeatTimeoutMs);
  }

  private resetHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      this.startHeartbeatTimer();
    }
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private forceClose(): void {
    if (this.ws) {
      try {
        this.ws.close(4000, 'heartbeat_timeout');
      } catch {
        // Ignore.
      }
      this.ws = null;
    }
    this.clearHeartbeatTimer();
    this.subscribedTopics.clear();
    this.scheduleReconnect();
  }

  // ── Internal: state & timers ─────────────────────────────────────

  private setState(next: RealtimeConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    for (const handler of this.stateListeners) {
      try {
        handler(next);
      } catch {
        // Ignore handler errors.
      }
    }
  }

  private clearTimers(): void {
    this.clearHeartbeatTimer();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ── Internal: restore persisted sequences ────────────────────────

  /**
   * Restore last-seen sequence numbers from persistent storage.
   * Called by the provider on app launch, before connect().
   */
  restoreSequences(topics: string[]): void {
    if (!this.config.sequenceStorage) return;
    for (const topic of topics) {
      const seq = this.config.sequenceStorage.get(topic);
      if (seq != null && seq > 0) {
        this.lastSeenSeq.set(topic, seq);
      }
    }
  }
}
