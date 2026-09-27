'use client';

/**
 * Live pins — the pinned-product rail's shared truth. One store both
 * sides of the stage read: the host console writes pin order here (via
 * hostStreams mutations), the viewer's LiveProductRail subscribes to it,
 * so pins a host sets mid-show reach viewers in the same session.
 *
 * Fixture sessions seed from LIVE_SESSION_PRODUCTS (the authored shows);
 * host-authored shows land here through createHostStream/setHostStreamPins.
 * Session-scoped like the rest of the demo runtime — nothing persists.
 * Live mode has no pins endpoint on the service yet, so backend sessions
 * simply resolve to an empty rail rather than a fabricated one.
 */

import { create } from 'zustand';
import { LIVE_SESSION_PRODUCTS } from '@/lib/data/fixtures-media';

/** A chat line the host pinned mid-show — surfaced to viewers as a note. */
export interface PinnedChatNote {
  user: string;
  text: string;
}

interface LivePinsState {
  /** session id → ordered listing ids; first is on the table. */
  pins: Record<string, string[]>;
  /** session id → the chat note the host pinned (Whatnot grammar). */
  chatNotes: Record<string, PinnedChatNote>;
}

export const useLivePins = create<LivePinsState>(() => ({
  pins: { ...LIVE_SESSION_PRODUCTS },
  chatNotes: {},
}));

/** Non-hook writer for runtime stores (hostStreams, session bootstrap). */
export function setLivePins(sessionId: string, pinIds: string[]): void {
  useLivePins.setState((s) => ({
    pins: { ...s.pins, [sessionId]: [...pinIds] },
  }));
}

/** Host-side writer — pin a chat line for every viewer of the show. */
export function setPinnedChatNote(sessionId: string, note: PinnedChatNote | null): void {
  useLivePins.setState((s) => {
    const chatNotes = { ...s.chatNotes };
    if (note) chatNotes[sessionId] = note;
    else delete chatNotes[sessionId];
    return { chatNotes };
  });
}

const EMPTY_PINS: string[] = [];

/** Viewer-side read — the ordered pinned listing ids for a session. */
export function useSessionPins(sessionId: string): string[] {
  // Stable empty reference — a fresh [] per call would defeat the
  // selector's Object.is memoization and re-render every frame.
  return useLivePins((s) => s.pins[sessionId] ?? EMPTY_PINS);
}

/** Viewer-side read — the chat note the host pinned, if any. */
export function usePinnedChatNote(sessionId: string): PinnedChatNote | null {
  return useLivePins((s) => s.chatNotes[sessionId] ?? null);
}
