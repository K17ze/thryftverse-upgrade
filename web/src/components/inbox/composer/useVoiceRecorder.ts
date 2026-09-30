import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useHydrated } from '@/lib/store/useStore';
import { waveformFor } from './VoiceRecordingBar';
import type { StagedAttachment } from './StagedAttachmentPreview';

interface UseVoiceRecorderOptions {
  onStagedVoice: (attachment: StagedAttachment) => void;
}

export function useVoiceRecorder({ onStagedVoice }: UseVoiceRecorderOptions) {
  const toast = useToast();
  const hydrated = useHydrated();
  // Voice capture — MediaRecorder + getUserMedia, feature-detected so the
  // mic control honestly never renders where the browser can't record.
  const canRecord =
    hydrated &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia;

  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef(0);
  const recordCancelledRef = useRef(false);

  // Escape while recording cancels it — capture phase so it wins over
  // the thread's Escape-to-deselect (an active recording is the
  // innermost thing to unwind, same grammar as a staged reply).
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      recordCancelledRef.current = true;
      recorderRef.current?.stop();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [recording]);

  // Recording elapsed clock — 4fps tick keeps the readout honest without
  // re-rendering the composer per animation frame.
  useEffect(() => {
    if (!recording) return;
    setElapsedMs(Date.now() - recordStartRef.current);
    const id = setInterval(
      () => setElapsedMs(Date.now() - recordStartRef.current),
      250,
    );
    return () => clearInterval(id);
  }, [recording]);

  // Unmount cleanup — a live recording must not outlive the composer
  // (thread switch or navigation): stop the recorder, release the mic.
  useEffect(
    () => () => {
      recordCancelledRef.current = true;
      try {
        recorderRef.current?.stop();
      } catch {
        /* already stopped */
      }
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  // ── Voice capture — real MediaRecorder flow: record → stop stages a
  // playable chip (the same preview-before-send grammar as a photo);
  // cancel discards. ──────────────────────────────────────────────────

  const finishRecording = async (mimeType: string) => {
    recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    recordStreamRef.current = null;
    recorderRef.current = null;
    const cancelled = recordCancelledRef.current;
    const chunks = recordChunksRef.current;
    recordChunksRef.current = [];
    const elapsed = Date.now() - recordStartRef.current;
    setRecording(false);
    if (cancelled || chunks.length === 0) return;
    const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
    const file = new File(chunks, `voice-note.${ext}`, { type: mimeType });
    // Decoded duration is the accurate figure; the timer is the fallback.
    const decoded = await waveformFor(file);
    onStagedVoice({
      kind: 'voice',
      uri: URL.createObjectURL(file),
      file,
      durationMs: decoded.durationMs ?? elapsed,
      waveform: decoded.waveform,
    });
  };

  const startRecording = async () => {
    if (recording || !canRecord) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType =
        ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) =>
          MediaRecorder.isTypeSupported(t),
        ) ?? '';
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recordChunksRef.current = [];
      recordCancelledRef.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        void finishRecording(recorder.mimeType || mimeType || 'audio/webm');
      };
      recordStreamRef.current = stream;
      recorderRef.current = recorder;
      recordStartRef.current = Date.now();
      recorder.start(250);
      setRecording(true);
    } catch {
      toast.show(
        "Microphone isn't available — check the browser permission",
        'error',
      );
    }
  };

  const stopRecording = () => {
    recordCancelledRef.current = false;
    recorderRef.current?.stop();
  };

  const cancelRecording = () => {
    recordCancelledRef.current = true;
    recorderRef.current?.stop();
  };

  return {
    canRecord,
    recording,
    elapsedMs,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
