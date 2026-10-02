export type LivePlaybackState =
  /** Hook inactive (fixture mode / demo show) or no session open. */
  | 'idle'
  /** Signed-in account required before the token endpoint will mint. */
  | 'auth'
  /** Token fetch / room join in flight. */
  | 'connecting'
  /** Room joined, host video not on the wire yet. */
  | 'waiting'
  /** Host video track subscribed and attached. */
  | 'watching'
  /** Token denied or the room connect dropped. */
  | 'error'
  /** The show ended (session row or live.session.ended). */
  | 'ended'
  /** This viewer was kicked — or muted, which denies re-entry. */
  | 'removed';

export interface LiveRoomEndSummary {
  totalViewers: number;
  lotsSold: number;
  totalSales: number;
}

export interface RealtimeEnvelope {
  topic?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

export const CHAT_RESYNC_MS = 15_000;
