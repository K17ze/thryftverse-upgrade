export type HostBroadcastPhase =
  /** Session is created/scheduled — nothing is on air yet. */
  | 'backstage'
  /** Session row is live — the media room may still be connecting. */
  | 'live'
  /** The show ended (session row status or live.session.ended). */
  | 'ended';

export type HostMediaState =
  /** No room attempt yet (backstage) or fully torn down. */
  | 'idle'
  /** Host-token mint / LiveKit connect in flight. */
  | 'connecting'
  /** getUserMedia prompt up, or tracks publishing. */
  | 'requesting'
  /** Camera + mic are published to the room. */
  | 'published'
  /** Camera/mic permission denied, or no device — session stays live. */
  | 'denied'
  /** Token, connect or publish failed for another reason. */
  | 'failed';

/** A viewer the host can act on — sourced from chat senders; there is no
 *  roster endpoint. */
export interface HostChatter {
  userId: string;
  userName: string;
}

export interface RealtimeEnvelope {
  topic?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

export const CHAT_RESYNC_MS = 15_000;
