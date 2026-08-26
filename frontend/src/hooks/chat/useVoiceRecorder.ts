import { useCallback, useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import {
  useAudioRecorder,
  useAudioRecorderState,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';
import { useHaptic } from '../useHaptic';

type RecordingState =
  | 'permission_unknown'
  | 'permission_denied'
  | 'permission_restricted'
  | 'ready'
  | 'preparing'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'preview_ready'
  | 'cancelling'
  | 'interrupted'
  | 'failed';

export interface VoiceRecorderState {
  state: RecordingState;
  isRecording: boolean;
  durationMs: number;
  metering: number | null;
  uri: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number | null;
  error: string | null;
  interruptionReason?: string;
  canStart: boolean;
  canPause: boolean;
  canResume: boolean;
  canStop: boolean;
  canCancel: boolean;
  canDeletePreview: boolean;
  canSendPreview: boolean;
}

export interface VoiceRecordingDraft {
  uri: string;
  fileName: string;
  contentType: string;
  durationMs: number;
  sizeBytes: number;
}

const MAX_RECORDING_MS = 120_000; // 2 minutes
const DRAFTS_DIR = `${FileSystem.cacheDirectory ?? ''}voice_drafts`;

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function makeDraftFileName(): string {
  return `voice_${Date.now()}_${Math.floor(Math.random() * 1_000_000).toString(36)}.m4a`;
}

function contentTypeForUri(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'm4a';
  if (ext === 'm4a' || ext === 'aac') return 'audio/m4a';
  if (ext === 'ogg' || ext === 'opus') return 'audio/ogg';
  if (ext === 'webm') return 'audio/webm';
  return 'audio/m4a';
}

async function ensureDraftsDir(): Promise<void> {
  const dir = await FileSystem.getInfoAsync(DRAFTS_DIR);
  if (!dir.exists) {
    await FileSystem.makeDirectoryAsync(DRAFTS_DIR, { intermediates: true });
  }
}

async function copyToDrafts(uri: string): Promise<{ uri: string; fileName: string }> {
  await ensureDraftsDir();
  const fileName = makeDraftFileName();
  const localUri = `${DRAFTS_DIR}/${fileName}`;
  await FileSystem.copyAsync({ from: uri, to: localUri });
  return { uri: localUri, fileName };
}

async function deleteDraft(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Best-effort cleanup.
  }
}

async function getFileSize(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      return info.size ?? null;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * useVoiceRecorder — app-level audio recording controller for chat voice
 * messages (report 19).
 *
 * Owns the recording session, permission posture, interruption handling and a
 * durable local draft. Replaces the component-local state in
 * VoiceMessageRecorder.tsx which caused the recorder to unmount when recording
 * became true (AGENTS.md §11 — truthful UI; §4 — anti-AI design).
 *
 * State machine:
 *   permission_unknown → requesting → denied | ready
 *   ready → preparing → recording
 *   recording → paused ↔ recording
 *   recording|paused → stopping → preview_ready
 *   recording|paused → cancelling → deleted
 *   recording → interrupted(reason) → recoverable_preview | failed
 */
export function useVoiceRecorder() {
  const haptic = useHaptic();

  // Enable metering so we can render a live amplitude bar during recording.
  // This is the expo-audio equivalent of expo-av's metering — the recorder
  // status includes a `metering` value (dBFS, typically -160..0) when
  // `isMeteringEnabled` is set on the preset.
  const meteringPreset = {
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  };
  const recorder = useAudioRecorder(meteringPreset);
  const recorderState = useAudioRecorderState(recorder);

  const [state, setState] = useState<RecordingState>('permission_unknown');
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [metering, setMetering] = useState<number | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [contentType, setContentType] = useState<string>('audio/m4a');
  const [sizeBytes, setSizeBytes] = useState<number | null>(null);
  const [interruptionReason, setInterruptionReason] = useState<string | undefined>(undefined);

  const recordStartRef = useRef<number>(0);
  const durationAtPauseRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nativeAvailable = (() => {
    try {
      return AudioModule?.AudioRecorder != null;
    } catch {
      return false;
    }
  })();

  // Permission check on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!nativeAvailable) {
        setState('failed');
        setError('Audio recording is not supported in this build');
        return;
      }
      try {
        const { status } = await AudioModule.getRecordingPermissionsAsync();
        if (cancelled) return;
        if (status === 'granted') {
          setState('ready');
        } else if (status === 'denied') {
          setState('permission_denied');
        } else {
          setState('permission_unknown');
        }
      } catch {
        if (!cancelled) setState('permission_unknown');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nativeAvailable]);

  // Watch duration + metering while recording; we poll the recorder's status
  // because wall-clock elapsed would be unreliable across pauses. Metering
  // gives us a live amplitude reading (dBFS) for the recording visualization.
  useEffect(() => {
    if (state !== 'recording') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = setInterval(() => {
      const wall = Date.now() - recordStartRef.current + durationAtPauseRef.current;
      setDurationMs(Math.min(wall, MAX_RECORDING_MS));
      // recorderState.metering is available when isMeteringEnabled is set.
      // It's a dBFS value (typically -160 to 0). We normalize it to 0..1
      // for the UI: 0 dBFS → 1.0, -60 dBFS → 0.0.
      const rawMetering = (recorderState as { metering?: number }).metering;
      if (typeof rawMetering === 'number') {
        const normalized = Math.max(0, Math.min(1, (rawMetering + 60) / 60));
        setMetering(normalized);
      }
    }, 100);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state, recorderState]);

  // Cleanup: stop any active recording on unmount.
  useEffect(() => {
    return () => {
      if (recorderState.isRecording) {
        recorder.stop().catch(() => {});
      }
      if (uri) {
        // Only delete if still in the cache draft; the consumer is responsible
        // for the final uri after `confirmPreview`.
        if (uri.startsWith(DRAFTS_DIR)) {
          deleteDraft(uri).catch(() => {});
        }
      }
    };
  }, [recorder, recorderState.isRecording, uri]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!nativeAvailable) {
      setError('Audio recording is not supported in this build');
      return false;
    }
    try {
      const { granted, status } = await AudioModule.requestRecordingPermissionsAsync();
      if (granted) {
        setError(null);
        setState('ready');
        return true;
      }
      if (status === 'denied') {
        setState('permission_denied');
      } else {
        setState('permission_restricted');
      }
      return false;
    } catch (e: unknown) {
      setState('failed');
      setError(e instanceof Error ? e.message : 'Permission request failed');
      return false;
    }
  }, [nativeAvailable]);

  const startRecording = useCallback(async () => {
    if (!nativeAvailable) return;
    if (state === 'permission_unknown' || state === 'permission_denied') {
      const ok = await requestPermission();
      if (!ok) return;
    }

    setError(null);
    setState('preparing');
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
        interruptionMode: 'doNotMix',
      });

      await recorder.prepareToRecordAsync();
      await recorder.record();
      recordStartRef.current = Date.now();
      durationAtPauseRef.current = 0;
      setDurationMs(0);
      setState('recording');
      haptic.medium();

      // Hard cap at 2 minutes.
      maxDurationTimerRef.current = setTimeout(() => {
        stopRecording().catch(() => {});
      }, MAX_RECORDING_MS);
    } catch (e: unknown) {
      setState('failed');
      setError(e instanceof Error ? e.message : 'Could not start recording');
      haptic.error();
    }
  }, [nativeAvailable, state, recorder, haptic, requestPermission]);

  const pauseRecording = useCallback(async () => {
    if (state !== 'recording') return;
    try {
      await recorder.pause();
      durationAtPauseRef.current += Date.now() - recordStartRef.current;
      setState('paused');
      haptic.light();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Pause failed');
    }
  }, [state, recorder, haptic]);

  const resumeRecording = useCallback(async () => {
    if (state !== 'paused') return;
    try {
      await recorder.record();
      recordStartRef.current = Date.now();
      setState('recording');
      haptic.medium();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Resume failed');
    }
  }, [state, recorder, haptic]);

  const stopRecording = useCallback(async (): Promise<VoiceRecordingDraft | null> => {
    if (state !== 'recording' && state !== 'paused') return null;
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    setState('stopping');
    try {
      await recorder.stop();
      const rawUri = recorder.uri ?? '';
      if (!rawUri) {
        throw new Error('Recording produced no audio file');
      }
      const finalDuration =
        durationMs ||
        Math.min(Date.now() - recordStartRef.current + durationAtPauseRef.current, MAX_RECORDING_MS);
      const draft = await copyToDrafts(rawUri);
      const ct = contentTypeForUri(draft.uri);
      const size = await getFileSize(draft.uri) ?? 0;
      setUri(draft.uri);
      setFileName(draft.fileName);
      setContentType(ct);
      setSizeBytes(size);
      setDurationMs(finalDuration);
      setState('preview_ready');
      haptic.success();
      return { ...draft, contentType: ct, durationMs: finalDuration, sizeBytes: size };
    } catch (e: unknown) {
      setState('failed');
      setError(e instanceof Error ? e.message : 'Could not stop recording');
      haptic.error();
      return null;
    }
  }, [state, durationMs, recorder, haptic]);

  const cancelRecording = useCallback(async () => {
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    if (recorderState.isRecording) {
      try {
        await recorder.stop();
      } catch {
        // ignore
      }
    }
    if (uri) {
      await deleteDraft(uri);
    }
    setState('ready');
    setUri(null);
    setFileName('');
    setContentType('audio/m4a');
    setSizeBytes(null);
    setDurationMs(0);
    setMetering(null);
    setError(null);
    setInterruptionReason(undefined);
    haptic.light();
  }, [recorder, recorderState.isRecording, uri, haptic]);

  const deletePreview = useCallback(async () => {
    if (uri) {
      await deleteDraft(uri);
    }
    setState('ready');
    setUri(null);
    setFileName('');
    setContentType('audio/m4a');
    setSizeBytes(null);
    setDurationMs(0);
    setMetering(null);
    setError(null);
    haptic.light();
  }, [uri, haptic]);

  const confirmPreview = useCallback(async (): Promise<VoiceRecordingDraft | null> => {
    if (state !== 'preview_ready' || !uri || sizeBytes === null) return null;
    const draft = {
      uri,
      fileName,
      contentType,
      durationMs,
      sizeBytes,
    };
    // Reset to ready WITHOUT deleting the file — the caller now owns the URI
    // and will upload it. Deleting here would race the upload.
    setState('ready');
    setUri(null);
    setFileName('');
    setContentType('audio/m4a');
    setSizeBytes(null);
    setDurationMs(0);
    setMetering(null);
    setError(null);
    return draft;
  }, [state, uri, fileName, contentType, durationMs, sizeBytes]);

  return {
    state,
    isRecording: state === 'recording' || state === 'paused',
    durationMs,
    durationLabel: formatDuration(durationMs),
    metering,
    uri,
    fileName,
    contentType,
    sizeBytes,
    error,
    interruptionReason,
    nativeAvailable,
    canStart: state === 'ready' || state === 'permission_unknown' || state === 'permission_denied',
    canPause: state === 'recording',
    canResume: state === 'paused',
    canStop: state === 'recording' || state === 'paused',
    canCancel: state === 'recording' || state === 'paused',
    canDeletePreview: state === 'preview_ready',
    canSendPreview: state === 'preview_ready',
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
    deletePreview,
    confirmPreview,
    requestPermission,
  };
}
