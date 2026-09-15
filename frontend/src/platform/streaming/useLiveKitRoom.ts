import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeModules, Platform } from 'react-native';

export type LiveKitConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/** A published or subscribed LiveKit video track (camera or screen share). */
export type LiveKitVideoTrack = import('livekit-client').VideoTrack;

export interface LiveKitTrackInfo {
  trackSid: string;
  trackName: string;
  kind: 'audio' | 'video';
  source: string;
  muted: boolean;
  enabled: boolean;
}

export interface LiveKitParticipantInfo {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  connectionQuality: string;
  tracks: LiveKitTrackInfo[];
}

export interface UseLiveKitRoomResult {
  state: LiveKitConnectionState;
  error: string | null;
  localParticipant: LiveKitParticipantInfo | null;
  remoteParticipants: LiveKitParticipantInfo[];
  /** The local camera track once publishing has started — null before
   *  `setCameraEnabled(true)` resolves or after it is disabled. */
  localVideoTrack: LiveKitVideoTrack | null;
  /** The first subscribed remote video track — camera preferred, screen
   *  share as fallback. Null until a remote track is actually subscribed. */
  remoteVideoTrack: LiveKitVideoTrack | null;
  /** Publish the local camera. Rejects when the room is not connected or
   *  the capture/permission request fails — callers must handle it. */
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  /** Publish the local microphone. Same contract as setCameraEnabled. */
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  disconnect: () => Promise<void>;
  isNativeModuleAvailable: boolean;
}

interface LiveKitRoomInternal {
  state: import('livekit-client').ConnectionState;
  localParticipant: import('livekit-client').LocalParticipant;
  remoteParticipants: Map<string, import('livekit-client').RemoteParticipant>;
  connect: (url: string, token: string) => Promise<void>;
  disconnect: (stopTracks?: boolean) => Promise<void>;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off: (event: string, callback: (...args: unknown[]) => void) => void;
}

type RoomEventListener = (...args: unknown[]) => void;

type LiveKitTrackKind = import('livekit-client').Track.Kind;
type LiveKitTrackSource = import('livekit-client').Track.Source;

const VIDEO_KIND = 'video' as LiveKitTrackKind;
const CAMERA_SOURCE = 'camera' as LiveKitTrackSource;

const extractTrackInfo = (publication: {
  trackSid: string;
  trackName: string;
  kind: string;
  source: string;
  isMuted: boolean;
  isEnabled: boolean;
  track?: { kind: string };
}): LiveKitTrackInfo => ({
  trackSid: publication.trackSid,
  trackName: publication.trackName,
  kind: publication.kind === 'audio' ? 'audio' : 'video',
  source: publication.source,
  muted: publication.isMuted,
  enabled: publication.isEnabled,
});

const extractParticipantInfo = (
  participant: {
    identity: string;
    name?: string;
    isSpeaking: boolean;
    connectionQuality: string;
    trackPublications: Map<string, { trackSid: string; trackName: string; kind: string; source: string; isMuted: boolean; isEnabled: boolean }>;
  },
  isLocal: boolean,
): LiveKitParticipantInfo => ({
  identity: participant.identity,
  name: participant.name ?? '',
  isLocal,
  isSpeaking: participant.isSpeaking,
  connectionQuality: participant.connectionQuality,
  tracks: Array.from(participant.trackPublications.values()).map(extractTrackInfo),
});

const isVideoTrack = (track: unknown): track is LiveKitVideoTrack =>
  typeof track === 'object' && track !== null
  && (track as { kind?: string }).kind === VIDEO_KIND;

const extractLocalVideoTrack = (
  participant: import('livekit-client').LocalParticipant,
): LiveKitVideoTrack | null => {
  const track = participant.getTrackPublication(CAMERA_SOURCE)?.track;
  return isVideoTrack(track) ? track : null;
};

const extractRemoteVideoTrack = (
  participants: Map<string, import('livekit-client').RemoteParticipant>,
): LiveKitVideoTrack | null => {
  let fallback: LiveKitVideoTrack | null = null;
  for (const participant of participants.values()) {
    for (const publication of participant.trackPublications.values()) {
      // On a remote publication `track` is only set once the subscription
      // has delivered a real media track — no metadata guessing.
      const track = publication.track;
      if (!isVideoTrack(track)) continue;
      if (publication.source === CAMERA_SOURCE) return track;
      if (!fallback) fallback = track;
    }
  }
  return fallback;
};

let liveKitNativeAvailable: boolean | null = null;

function checkNativeModuleAvailable(): boolean {
  if (liveKitNativeAvailable !== null) return liveKitNativeAvailable;
  if (Platform.OS === 'web') {
    liveKitNativeAvailable = false;
    return liveKitNativeAvailable;
  }
  try {
    // Real probe: the JS modules always import under Metro — only the
    // registered native modules prove the dev-client actually contains
    // WebRTC. WebRTCModule ships in @livekit/react-native-webrtc,
    // LivekitReactNativeModule in @livekit/react-native.
    liveKitNativeAvailable = Boolean(
      NativeModules.WebRTCModule && NativeModules.LivekitReactNativeModule,
    );
  } catch {
    liveKitNativeAvailable = false;
  }
  return liveKitNativeAvailable;
}

async function createRoom(): Promise<LiveKitRoomInternal> {
  const { Room } = await import('livekit-client');
  return new Room({ adaptiveStream: true, dynacast: true }) as unknown as LiveKitRoomInternal;
}

/**
 * Connect to a LiveKit room using a token and manage connection lifecycle.
 * Exposes publish controls (camera/mic) and the raw video track objects so
 * surfaces can render real media. Gracefully degrades when the native
 * module is unavailable — the hook returns an `error` state instead of
 * crashing.
 */
export function useLiveKitRoom(
  url: string | null,
  token: string | null,
): UseLiveKitRoomResult {
  const [state, setState] = useState<LiveKitConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [localParticipant, setLocalParticipant] = useState<LiveKitParticipantInfo | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<LiveKitParticipantInfo[]>([]);
  const [localVideoTrack, setLocalVideoTrack] = useState<LiveKitVideoTrack | null>(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<LiveKitVideoTrack | null>(null);
  const [isNativeModuleAvailable, setIsNativeModuleAvailable] = useState(true);

  const roomRef = useRef<LiveKitRoomInternal | null>(null);
  const listenersRef = useRef<Array<{ event: string; fn: RoomEventListener }>>([]);

  const syncParticipants = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;

    setLocalParticipant(
      extractParticipantInfo(
        room.localParticipant as unknown as {
          identity: string;
          name?: string;
          isSpeaking: boolean;
          connectionQuality: string;
          trackPublications: Map<string, { trackSid: string; trackName: string; kind: string; source: string; isMuted: boolean; isEnabled: boolean }>;
        },
        true,
      ),
    );

    setRemoteParticipants(
      Array.from(room.remoteParticipants.values()).map((p) =>
        extractParticipantInfo(
          p as unknown as {
            identity: string;
            name?: string;
            isSpeaking: boolean;
            connectionQuality: string;
            trackPublications: Map<string, { trackSid: string; trackName: string; kind: string; source: string; isMuted: boolean; isEnabled: boolean }>;
          },
          false,
        ),
      ),
    );

    setLocalVideoTrack(extractLocalVideoTrack(room.localParticipant));
    setRemoteVideoTrack(extractRemoteVideoTrack(room.remoteParticipants));
  }, []);

  const setCameraEnabled = useCallback(async (enabled: boolean) => {
    const room = roomRef.current;
    if (!room) throw new Error('Cannot change camera — the room is not connected');
    await room.localParticipant.setCameraEnabled(enabled);
    syncParticipants();
  }, [syncParticipants]);

  const setMicrophoneEnabled = useCallback(async (enabled: boolean) => {
    const room = roomRef.current;
    if (!room) throw new Error('Cannot change microphone — the room is not connected');
    await room.localParticipant.setMicrophoneEnabled(enabled);
    syncParticipants();
  }, [syncParticipants]);

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.disconnect(true);
    } catch {
      // Best-effort disconnect — never crash on cleanup
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const connect = async () => {
      if (!url || !token) {
        setState('disconnected');
        setLocalVideoTrack(null);
        setRemoteVideoTrack(null);
        return;
      }

      const nativeAvailable = checkNativeModuleAvailable();
      if (cancelled) return;
      setIsNativeModuleAvailable(nativeAvailable);

      if (!nativeAvailable) {
        setState('error');
        setError('LiveKit native module is not available on this platform');
        return;
      }

      try {
        setState('connecting');
        setError(null);

        const room = await createRoom();
        if (cancelled) {
          await room.disconnect(true).catch(() => {});
          return;
        }
        roomRef.current = room;

        const onConnectionStateChanged: RoomEventListener = (newState: unknown) => {
          const stateStr = String(newState);
          if (stateStr === 'connected') setState('connected');
          else if (stateStr === 'connecting') setState('connecting');
          else if (stateStr === 'reconnecting') setState('reconnecting');
          else if (stateStr === 'disconnected') setState('disconnected');
        };

        const onParticipantChanged: RoomEventListener = () => syncParticipants();

        const listeners: Array<{ event: string; fn: RoomEventListener }> = [
          { event: 'ConnectionStateChanged', fn: onConnectionStateChanged },
          { event: 'ParticipantConnected', fn: onParticipantChanged },
          { event: 'ParticipantDisconnected', fn: onParticipantChanged },
          { event: 'TrackPublished', fn: onParticipantChanged },
          { event: 'TrackUnpublished', fn: onParticipantChanged },
          { event: 'TrackSubscribed', fn: onParticipantChanged },
          { event: 'TrackUnsubscribed', fn: onParticipantChanged },
          { event: 'TrackMuted', fn: onParticipantChanged },
          { event: 'TrackUnmuted', fn: onParticipantChanged },
          { event: 'LocalTrackPublished', fn: onParticipantChanged },
          { event: 'LocalTrackUnpublished', fn: onParticipantChanged },
          { event: 'ActiveSpeakersChanged', fn: onParticipantChanged },
        ];

        for (const listener of listeners) {
          room.on(listener.event, listener.fn);
          listenersRef.current.push(listener);
        }

        await room.connect(url, token);
        if (cancelled) {
          await room.disconnect(true).catch(() => {});
          return;
        }

        syncParticipants();
      } catch (err) {
        if (cancelled) return;
        setState('error');
        setError(err instanceof Error ? err.message : 'Failed to connect to LiveKit room');
      }
    };

    void connect();

    return () => {
      cancelled = true;
      const room = roomRef.current;
      if (room) {
        for (const { event, fn } of listenersRef.current) {
          room.off(event, fn);
        }
        listenersRef.current = [];
        void room.disconnect(true).catch(() => {});
        roomRef.current = null;
      }
      setLocalVideoTrack(null);
      setRemoteVideoTrack(null);
    };
  }, [url, token, syncParticipants]);

  return {
    state,
    error,
    localParticipant,
    remoteParticipants,
    localVideoTrack,
    remoteVideoTrack,
    setCameraEnabled,
    setMicrophoneEnabled,
    disconnect,
    isNativeModuleAvailable,
  };
}
