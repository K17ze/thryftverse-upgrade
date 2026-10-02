'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '@/lib/api/http';
import * as liveService from '@/lib/api/services/live';
import type { LivePlaybackState } from './liveRoomTypes';

type LiveKitVideoTrack = import('livekit-client').RemoteVideoTrack;
type LiveKitAudioTrack = import('livekit-client').RemoteAudioTrack;

export interface UseLiveKitPlaybackParams {
  live: boolean;
  sessionId: string | null;
  isLiveNow: boolean;
  isGuest: boolean;
  attempt: number;
  sessionStatus?: string;
}

export function useLiveKitPlayback({
  live,
  sessionId,
  isLiveNow,
  isGuest,
  attempt,
  sessionStatus,
}: UseLiveKitPlaybackParams) {
  const [playback, setPlayback] = useState<LivePlaybackState>('idle');

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const roomRef = useRef<import('livekit-client').Room | null>(null);
  const videoTrackRef = useRef<LiveKitVideoTrack | null>(null);
  const audioTrackRef = useRef<LiveKitAudioTrack | null>(null);
  const joinedRef = useRef(false);

  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
    if (el && videoTrackRef.current) videoTrackRef.current.attach(el);
  }, []);

  const attachAudio = useCallback((el: HTMLAudioElement | null) => {
    audioElRef.current = el;
    if (el && audioTrackRef.current) audioTrackRef.current.attach(el);
  }, []);

  // ── LiveKit viewer join — a viewer token is only minted while the
  //    session is live (409 otherwise) and never for muted viewers (403).
  //    Both failures map to honest states, never a fake feed. ───────────
  useEffect(() => {
    if (!live || !sessionId) {
      setPlayback('idle');
      return;
    }
    if (!isLiveNow) {
      // Ended / upcoming — LivePlayer renders the replay or the honest
      // not-live state; there is no room to join.
      setPlayback(sessionStatus === 'ended' ? 'ended' : 'idle');
      return;
    }
    if (isGuest) {
      setPlayback('auth');
      return;
    }

    let cancelled = false;
    let room: import('livekit-client').Room | null = null;
    joinedRef.current = false;
    setPlayback('connecting');

    const onVideoTrack = (track: LiveKitVideoTrack | null) => {
      videoTrackRef.current = track;
      if (track && videoElRef.current) track.attach(videoElRef.current);
      if (!track && videoElRef.current) {
        try {
          videoElRef.current.srcObject = null;
        } catch {
          // best-effort detach
        }
      }
      setPlayback((prev) =>
        prev === 'ended' || prev === 'removed'
          ? prev
          : track
            ? 'watching'
            : 'waiting',
      );
    };

    const onAudioTrack = (track: LiveKitAudioTrack | null) => {
      audioTrackRef.current = track;
      if (track && audioElRef.current) track.attach(audioElRef.current);
      if (!track && audioElRef.current) {
        try {
          audioElRef.current.srcObject = null;
        } catch {
          // best-effort detach
        }
      }
    };

    (async () => {
      let join: liveService.StreamJoinToken;
      try {
        join = await liveService.fetchStreamToken(sessionId, 'viewer');
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiRequestError) {
          if (error.status === 401) {
            setPlayback('auth');
            return;
          }
          if (error.status === 403) {
            setPlayback('removed');
            return;
          }
          if (error.status === 409) {
            // STREAM_NOT_LIVE — the hub's session row went stale.
            setPlayback('ended');
            return;
          }
        }
        setPlayback('error');
        return;
      }

      if (cancelled) return;
      joinedRef.current = true;

      try {
        const lk = await import('livekit-client');
        if (cancelled) return;

        room = new lk.Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;
        room.on(lk.RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === lk.Track.Kind.Video) {
            onVideoTrack(track as LiveKitVideoTrack);
          } else if (track.kind === lk.Track.Kind.Audio) {
            onAudioTrack(track as LiveKitAudioTrack);
          }
        });
        room.on(lk.RoomEvent.TrackUnsubscribed, (track) => {
          if (track.kind === lk.Track.Kind.Video) onVideoTrack(null);
          else if (track.kind === lk.Track.Kind.Audio) onAudioTrack(null);
        });
        room.on(lk.RoomEvent.Disconnected, () => {
          if (cancelled) return;
          onVideoTrack(null);
          onAudioTrack(null);
          setPlayback((prev) =>
            prev === 'ended' || prev === 'removed' ? prev : 'error',
          );
        });

        await room.connect(join.wsUrl, join.token);
        if (cancelled) {
          await room.disconnect().catch(() => {});
          return;
        }

        // Tracks published before we joined arrive as TrackSubscribed —
        // sweep the publications too so nothing depends on event ordering.
        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            const track = publication.track;
            if (!track) continue;
            if (track.kind === lk.Track.Kind.Video) {
              onVideoTrack(track as LiveKitVideoTrack);
            } else if (track.kind === lk.Track.Kind.Audio) {
              onAudioTrack(track as LiveKitAudioTrack);
            }
          }
        }

        setPlayback((prev) =>
          prev === 'connecting' ? 'waiting' : prev,
        );
      } catch {
        if (!cancelled) setPlayback('error');
      }
    })();

    return () => {
      cancelled = true;
      videoTrackRef.current = null;
      audioTrackRef.current = null;
      if (roomRef.current === room) roomRef.current = null;
      if (room) void room.disconnect().catch(() => {});
      // The room's authoritative viewer set only contains us once a token
      // was minted — leave is a no-op for everyone else, so guard anyway.
      if (joinedRef.current && sessionId) {
        joinedRef.current = false;
        void liveService.leaveStreamSession(sessionId).catch(() => {});
      }
    };
  }, [live, sessionId, isLiveNow, isGuest, attempt, sessionStatus]);

  // A minted LiveKit token can't be revoked server-side — the kick/mute
  // removal and the ended event are enforced client-side by dropping the
  // room and detaching media the moment the state lands.
  useEffect(() => {
    if (playback !== 'removed' && playback !== 'ended') return;
    const room = roomRef.current;
    roomRef.current = null;
    if (room) void room.disconnect().catch(() => {});
    videoTrackRef.current = null;
    audioTrackRef.current = null;
  }, [playback]);

  return {
    playback,
    setPlayback,
    attachVideo,
    attachAudio,
  };
}
