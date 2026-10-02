'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseApiError } from '@/lib/api/http';
import * as liveService from '@/lib/api/services/live';
import type { HostMediaState } from './broadcastTypes';

type LocalVideoTrack = import('livekit-client').LocalVideoTrack;
type LocalAudioTrack = import('livekit-client').LocalAudioTrack;

export interface UseHostMediaPipelineParams {
  sessionId: string | null;
  preMintedToken?: liveService.StreamJoinToken | null;
}

export function useHostMediaPipeline({
  sessionId,
  preMintedToken,
}: UseHostMediaPipelineParams) {
  const [media, setMedia] = useState<HostMediaState>('idle');
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [camMuted, setCamMuted] = useState(false);
  const [cameraCheck, setCameraCheck] = useState<'idle' | 'on' | 'denied'>('idle');
  const [attempt, setAttempt] = useState(0);

  const roomRef = useRef<import('livekit-client').Room | null>(null);
  const videoTrackRef = useRef<LocalVideoTrack | null>(null);
  const audioTrackRef = useRef<LocalAudioTrack | null>(null);
  const previewElRef = useRef<HTMLVideoElement | null>(null);
  const checkStreamRef = useRef<MediaStream | null>(null);
  const tokenRef = useRef<liveService.StreamJoinToken | null>(
    preMintedToken ?? null,
  );
  const generationRef = useRef(0);
  const connectingRef = useRef(false);

  const retryMedia = useCallback(() => setAttempt((n) => n + 1), []);

  const attachPreview = useCallback((el: HTMLVideoElement | null) => {
    previewElRef.current = el;
    if (!el) return;
    if (videoTrackRef.current) {
      videoTrackRef.current.attach(el);
    } else if (checkStreamRef.current) {
      el.srcObject = checkStreamRef.current;
    }
  }, []);

  const teardownMedia = useCallback(() => {
    generationRef.current += 1;
    const room = roomRef.current;
    roomRef.current = null;
    videoTrackRef.current = null;
    audioTrackRef.current = null;
    if (room) void room.disconnect().catch(() => {});
    const check = checkStreamRef.current;
    checkStreamRef.current = null;
    check?.getTracks().forEach((t) => t.stop());
    setCameraCheck('idle');
    setMicMuted(false);
    setCamMuted(false);
  }, []);

  const connectAndPublish = useCallback(async () => {
    if (!sessionId || connectingRef.current || roomRef.current) return;
    connectingRef.current = true;
    const gen = generationRef.current;
    const stale = () => generationRef.current !== gen;
    setMedia('connecting');
    setMediaError(null);

    try {
      let join = tokenRef.current;
      if (!join) {
        try {
          join = await liveService.fetchStreamToken(sessionId, 'host');
        } catch (error) {
          setMedia('failed');
          setMediaError(
            parseApiError(error, 'Could not get a broadcast token').message,
          );
          return;
        }
        tokenRef.current = join;
      }
      if (stale()) return;

      const lk = await import('livekit-client');
      if (stale()) return;

      const room = new lk.Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(lk.RoomEvent.Disconnected, () => {
        if (roomRef.current !== room) return;
        roomRef.current = null;
        videoTrackRef.current = null;
        audioTrackRef.current = null;
        setMedia((prev) => (prev === 'idle' ? prev : 'failed'));
        setMediaError('The broadcast connection dropped — retry to reconnect.');
      });

      try {
        await room.connect(join.wsUrl, join.token);
      } catch {
        if (roomRef.current === room) roomRef.current = null;
        void room.disconnect().catch(() => {});
        setMedia('failed');
        setMediaError('Could not connect to the broadcast room.');
        return;
      }
      if (stale()) {
        void room.disconnect().catch(() => {});
        return;
      }

      setMedia('requesting');
      const check = checkStreamRef.current;
      checkStreamRef.current = null;
      check?.getTracks().forEach((t) => t.stop());
      setCameraCheck('idle');

      let tracks: Awaited<ReturnType<typeof lk.createLocalTracks>>;
      try {
        tracks = await lk.createLocalTracks({ audio: true, video: true });
      } catch (error) {
        const name = (error as DOMException)?.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setMedia('denied');
          setMediaError(
            'Camera and microphone access was denied — allow both in the browser and retry.',
          );
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setMedia('denied');
          setMediaError('No camera or microphone was found on this device.');
        } else {
          setMedia('failed');
          setMediaError('The camera or microphone could not be started.');
        }
        return;
      }
      if (stale()) {
        tracks.forEach((t) => t.stop());
        return;
      }

      for (const track of tracks) {
        if (track.kind === lk.Track.Kind.Video) {
          videoTrackRef.current = track as LocalVideoTrack;
        } else if (track.kind === lk.Track.Kind.Audio) {
          audioTrackRef.current = track as LocalAudioTrack;
        }
      }

      try {
        for (const track of tracks) {
          await room.localParticipant.publishTrack(track);
        }
      } catch {
        tracks.forEach((t) => t.stop());
        videoTrackRef.current = null;
        audioTrackRef.current = null;
        setMedia('failed');
        setMediaError('Connected, but the camera/mic could not be published.');
        return;
      }
      if (stale()) {
        tracks.forEach((t) => t.stop());
        return;
      }

      if (videoTrackRef.current && previewElRef.current) {
        videoTrackRef.current.attach(previewElRef.current);
      }
      setMedia('published');
    } finally {
      connectingRef.current = false;
    }
  }, [sessionId]);

  const startCameraCheck = useCallback(async () => {
    // Already running is a no-op — it's not a denial.
    if (cameraCheck === 'on') return;
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraCheck('denied');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      checkStreamRef.current?.getTracks().forEach((t) => t.stop());
      checkStreamRef.current = stream;
      if (previewElRef.current) previewElRef.current.srcObject = stream;
      setCameraCheck('on');
    } catch {
      setCameraCheck('denied');
    }
  }, [cameraCheck]);

  const stopCameraCheck = useCallback(() => {
    const stream = checkStreamRef.current;
    checkStreamRef.current = null;
    stream?.getTracks().forEach((t) => t.stop());
    if (previewElRef.current) previewElRef.current.srcObject = null;
    setCameraCheck('idle');
  }, []);

  const toggleMic = useCallback(() => {
    const track = audioTrackRef.current;
    if (!track) return;
    const next = !micMuted;
    setMicMuted(next);
    void (next ? track.mute() : track.unmute()).catch(() =>
      setMicMuted(!next),
    );
  }, [micMuted]);

  const toggleCamera = useCallback(() => {
    const track = videoTrackRef.current;
    if (!track) return;
    const next = !camMuted;
    setCamMuted(next);
    void (next ? track.mute() : track.unmute()).catch(() =>
      setCamMuted(!next),
    );
  }, [camMuted]);

  useEffect(
    () => () => {
      teardownMedia();
    },
    [teardownMedia],
  );

  return {
    media,
    mediaError,
    micMuted,
    camMuted,
    cameraCheck,
    attempt,
    roomRef,
    connectingRef,
    attachPreview,
    connectAndPublish,
    teardownMedia,
    startCameraCheck,
    stopCameraCheck,
    toggleMic,
    toggleCamera,
    retryMedia,
  };
}
