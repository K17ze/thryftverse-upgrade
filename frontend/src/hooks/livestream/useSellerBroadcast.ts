/**
 * useSellerBroadcast — the seller broadcast session lifecycle.
 *
 * Owns:
 * - Phase state machine (setup → live → summary)
 * - Session create → schedule lots → host token → start (handleGoLive)
 * - Resume of an in-progress session from a route param
 * - Elapsed timer while live
 * - Realtime subscriptions while live (chat, viewer count, stream events)
 *   — subscribe/unsubscribe pairs stay atomic in one effect
 * - End-stream transition into the summary phase
 * - Host LiveKit room join (presence only — publishing is a shared-layer gap)
 * - Broadcast stats (lots sold, total sales) and lot settlement status
 *
 * Truthful UI (AGENTS §11): everything flows through the real backend
 * routes — when session creation fails the error is reported, never faked.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useHaptic } from '../useHaptic';
import { useLiveKitRoom } from '../../platform/streaming';
import type { ListingApiItem } from '../../services/listingsApi';
import {
  createBroadcastSession,
  startBroadcastSession,
  endBroadcastSession,
  fetchBroadcastSession,
  fetchBroadcastHostToken,
  type BroadcastSession } from '../../components/live/liveBroadcastApi';
import {
  scheduleLot,
  fetchSessionLots,
  setCurrentLot,
  subscribeToChat,
  subscribeToViewerCount,
  subscribeToStreamEvents,
  fetchStreamChatHistory,
  type LiveLotAggregate,
  type LiveStreamChatMessage,
  type LotSettlementStatus } from '../../services/liveShoppingApi';
import type { SellerPhase } from './types';

interface UseSellerBroadcastOptions {
  resumeSessionId: string | undefined;
  selectedListings: ListingApiItem[];
  title: string;
}

export function useSellerBroadcast({ resumeSessionId, selectedListings, title }: UseSellerBroadcastOptions) {
  const haptic = useHaptic();

  // ── Phase & setup state ──
  const [phase, setPhase] = useState<SellerPhase>('setup');
  const [goingLive, setGoingLive] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // ── Live state ──
  const [session, setSession] = useState<BroadcastSession | null>(null);
  const [lots, setLots] = useState<LiveLotAggregate[]>([]);
  const [currentLotIndex, setCurrentLotIndex] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [messages, setMessages] = useState<LiveStreamChatMessage[]>([]);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [lotsSold, setLotsSold] = useState(0);
  const [totalSalesMinor, setTotalSalesMinor] = useState(0);
  const [endingStream, setEndingStream] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [settlementStatus, setSettlementStatus] = useState<LotSettlementStatus | null>(null);
  const [hostCredentials, setHostCredentials] = useState<{ wsUrl: string; token: string } | null>(null);

  const startedAtRef = useRef<number>(0);
  const sessionId = session?.roomId ?? null;

  // Host joins the LiveKit room with the host token. Publishing camera
  // frames requires publish controls in the shared streaming layer — a
  // known backend/frontend gap; the room join still keeps presence real.
  const liveKit = useLiveKitRoom(hostCredentials?.wsUrl ?? null, hostCredentials?.token ?? null);

  // ── Resume an in-progress session when the route carries one ──
  useEffect(() => {
    if (!resumeSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const existing = await fetchBroadcastSession(resumeSessionId);
        if (cancelled || !existing || existing.status !== 'live') return;
        const { lots: existingLots } = await fetchSessionLots(resumeSessionId);
        if (cancelled) return;
        setSession(existing);
        setLots(existingLots.sort((a, b) => a.lotNumber - b.lotNumber));
        setPhase('live');
        startedAtRef.current = existing.startedAt ? new Date(existing.startedAt).getTime() : Date.now();
        try {
          const token = await fetchBroadcastHostToken(resumeSessionId);
          if (!cancelled) setHostCredentials({ wsUrl: token.wsUrl, token: token.token });
        } catch {
          // Host token failure degrades to chat/lot-only control — honest,
          // the preview label below already says video is local-only.
        }
      } catch {
        // Resume is best-effort; seller stays on setup.
      }
    })();
    return () => { cancelled = true; };
  }, [resumeSessionId]);

  // ── Elapsed timer while live ──
  useEffect(() => {
    if (phase !== 'live') return;
    const interval = setInterval(() => {
      setLiveSeconds(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // ── Realtime subscriptions while live ──
  useEffect(() => {
    if (phase !== 'live' || !sessionId) return;

    let cancelled = false;
    void fetchStreamChatHistory(sessionId).then((history) => {
      if (!cancelled) setMessages(history);
    }).catch(() => {});

    const unsubChat = subscribeToChat(sessionId, (payload) => {
      setMessages((prev) => [...prev.slice(-80), payload.message]);
    });
    const unsubViewers = subscribeToViewerCount(sessionId, (payload) => {
      setViewerCount(payload.count);
    });
    const unsubEvents = subscribeToStreamEvents(sessionId, (event) => {
      if (event.type === 'lot_sold') {
        const payload = event.payload as { finalPrice?: number };
        const finalPrice = payload.finalPrice;
        if (typeof finalPrice === 'number') {
          setTotalSalesMinor((prev) => prev + Math.round(finalPrice * 100));
          setLotsSold((prev) => prev + 1);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubChat();
      unsubViewers();
      unsubEvents();
    };
  }, [phase, sessionId]);

  // ── Actions ──

  const handleGoLive = useCallback(async () => {
    if (selectedListings.length === 0 || goingLive) return;
    haptic.medium();
    setGoingLive(true);
    setSetupError(null);
    try {
      // 1. Create the session on the backend.
      const created = await createBroadcastSession({
        title: title.trim() || 'Live auction' });
      // 2. Schedule the selected listings as real lots.
      const scheduled: LiveLotAggregate[] = [];
      for (let i = 0; i < selectedListings.length; i += 1) {
        const listing = selectedListings[i];
        const lot = await scheduleLot(created.roomId, {
          listingId: listing.id,
          lotNumber: i + 1,
          startPriceMinor: Math.round((listing.priceGbp ?? 0) * 100) });
        scheduled.push(lot);
      }
      // 3. Point viewers at the first lot.
      try {
        await setCurrentLot(created.roomId, scheduled[0].listingId, scheduled[0].lotNumber);
      } catch {
        // Current-lot is best-effort; the seller can still open bidding.
      }
      // 4. Host token → join the LiveKit room (presence; publishing is a
      //    shared-layer gap — see file header).
      try {
        const token = await fetchBroadcastHostToken(created.roomId);
        setHostCredentials({ wsUrl: token.wsUrl, token: token.token });
      } catch {
        // Degrade honestly: lots/chat still work without media.
      }
      // 5. Flip the session to live.
      const started = await startBroadcastSession(created.roomId);
      setSession(started);
      setLots(scheduled);
      setCurrentLotIndex(0);
      setViewerCount(0);
      setMessages([]);
      setLotsSold(0);
      setTotalSalesMinor(0);
      setSettlementStatus(null);
      startedAtRef.current = started.startedAt
        ? new Date(started.startedAt).getTime()
        : Date.now();
      setPhase('live');
      haptic.success();
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : 'Could not start the stream — try again.');
      haptic.error();
    } finally {
      setGoingLive(false);
    }
  }, [selectedListings, goingLive, haptic, title]);

  const handleEndStream = useCallback(async () => {
    if (endingStream) return;
    haptic.medium();
    setEndingStream(true);
    setEndError(null);
    try {
      if (sessionId) {
        await endBroadcastSession(sessionId);
      }
      setPhase('summary');
    } catch {
      // Honest unknown outcome — the session may already be closed server-
      // side. Surface the error and stay on the live surface so the seller
      // can retry rather than fabricating a clean end.
      setEndError('End of stream could not be confirmed — check before going live again.');
      haptic.error();
    } finally {
      setEndingStream(false);
    }
  }, [sessionId, endingStream, haptic]);

  // Sale stats are shared between the realtime 'lot_sold' event above and
  // the seller-driven close-lot transition in useSellerLotControls.
  const recordSale = useCallback((highBidMinor: number) => {
    setLotsSold((prev) => prev + 1);
    setTotalSalesMinor((prev) => prev + highBidMinor);
  }, []);

  return {
    phase,
    session,
    sessionId,
    lots,
    setLots,
    currentLotIndex,
    setCurrentLotIndex,
    settlementStatus,
    setSettlementStatus,
    viewerCount,
    messages,
    liveSeconds,
    lotsSold,
    totalSalesMinor,
    endingStream,
    endError,
    goingLive,
    setupError,
    setSetupError,
    liveKit,
    handleGoLive,
    handleEndStream,
    recordSale };
}
