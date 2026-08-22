import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type LiveKitConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

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

let liveKitNativeAvailable: boolean | null = null;

async function checkNativeModuleAvailable(): Promise<boolean> {
  if (liveKitNativeAvailable !== null) return liveKitNativeAvailable;
  if (Platform.OS === 'web') {
    liveKitNativeAvailable = false;
    return false;
  }
  try {
    await import('@livekit/react-native');
    liveKitNativeAvailable = true;
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
 * Gracefully degrades when the native module is unavailable — the hook
 * returns an `error` state instead of crashing.
 */
export function useLiveKitRoom(
  url: string | null,
  token: string | null,
): UseLiveKitRoomResult {
  const [state, setState] = useState<LiveKitConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [localParticipant, setLocalParticipant] = useState<LiveKitParticipantInfo | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<LiveKitParticipantInfo[]>([]);
  const [isNativeModuleAvailable, setIsNativeModuleAvailable] = useState(true);

  const roomRef = useRef<LiveKitRoomInternal | null>(null);
  const listenersRef = useRef<RoomEventListener[]>([]);
  const connectTokenRef = useRef<string | null>(null);
  const connectUrlRef = useRef<string | null>(null);

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
  }, []);

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
        return;
      }

      connectUrlRef.current = url;
      connectTokenRef.current = token;

      const nativeAvailable = await checkNativeModuleAvailable();
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

        const onParticipantConnected: RoomEventListener = () => syncParticipants();
        const onParticipantDisconnected: RoomEventListener = () => syncParticipants();
        const onTrackPublished: RoomEventListener = () => syncParticipants();
        const onTrackSubscribed: RoomEventListener = () => syncParticipants();
        const onTrackUnsubscribed: RoomEventListener = () => syncParticipants();
        const onParticipantSpeaking: RoomEventListener = () => syncParticipants();

        const listeners: Array<{ event: string; fn: RoomEventListener }> = [
          { event: 'ConnectionStateChanged', fn: onConnectionStateChanged },
          { event: 'ParticipantConnected', fn: onParticipantConnected },
          { event: 'ParticipantDisconnected', fn: onParticipantDisconnected },
          { event: 'TrackPublished', fn: onTrackPublished },
          { event: 'TrackSubscribed', fn: onTrackSubscribed },
          { event: 'TrackUnsubscribed', fn: onTrackUnsubscribed },
          { event: 'ActiveSpeakersChanged', fn: onParticipantSpeaking },
        ];

        for (const { event, fn } of listeners) {
          room.on(event, fn);
          listenersRef.current.push(fn);
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
        for (const fn of listenersRef.current) {
          room.off('ConnectionStateChanged', fn);
          room.off('ParticipantConnected', fn);
          room.off('ParticipantDisconnected', fn);
          room.off('TrackPublished', fn);
          room.off('TrackSubscribed', fn);
          room.off('TrackUnsubscribed', fn);
          room.off('ActiveSpeakersChanged', fn);
        }
        listenersRef.current = [];
        void room.disconnect(true).catch(() => {});
        roomRef.current = null;
      }
    };
  }, [url, token, syncParticipants]);

  return {
    state,
    error,
    localParticipant,
    remoteParticipants,
    disconnect,
    isNativeModuleAvailable,
  };
}
