'use client';

/**
 * VoiceRecordingBar — live voice capture bar with elapsed recording clock,
 * pulsing status indicator, and stop/discard controls.
 * Also exports waveformFor helper for audio peak sampling.
 */

import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';

/** m:ss for the recording bar and the staged voice chip. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Best-effort waveform — decodes the recorded blob and buckets ~36 peak
 * samples (matching the mobile voiceWaveform shape).
 */
export async function waveformFor(file: File): Promise<{ durationMs?: number; waveform?: number[] }> {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return {};
    const ctx = new Ctx();
    try {
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      const data = buf.getChannelData(0);
      const bars = 36;
      const step = Math.max(1, Math.floor(data.length / bars));
      const stride = Math.max(1, Math.floor(step / 48));
      const peaks: number[] = [];
      for (let i = 0; i < bars; i++) {
        let peak = 0;
        const from = i * step;
        const to = Math.min(from + step, data.length);
        for (let j = from; j < to; j += stride) {
          peak = Math.max(peak, Math.abs(data[j]));
        }
        peaks.push(peak);
      }
      const max = Math.max(...peaks, 0.001);
      return {
        durationMs: Math.round(buf.duration * 1000),
        waveform: peaks.map((v) => Math.round((v / max) * 100) / 100),
      };
    } finally {
      void ctx.close();
    }
  } catch {
    return {};
  }
}

interface VoiceRecordingBarProps {
  elapsedMs: number;
  onCancel: () => void;
  onStop: () => void;
}

export function VoiceRecordingBar({
  elapsedMs,
  onCancel,
  onStop,
}: VoiceRecordingBarProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-2 md:px-3" role="status">
      <IconButton
        name="close"
        aria-label="Discard voice recording"
        onClick={onCancel}
      />
      <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-chat bg-surface-alt px-4 py-1.5">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-danger"
        />
        <span className="tnum text-body font-medium text-text-primary">
          {formatElapsed(elapsedMs)}
        </span>
        <span className="clamp-1 text-meta text-text-muted">
          Recording — stop to preview before sending
        </span>
      </div>
      <button
        type="button"
        onClick={onStop}
        aria-label="Stop recording"
        className="pressable -my-0.5 flex h-11 w-11 shrink-0 items-center justify-center"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-text-inverse">
          <Icon name="stop" size={18} />
        </span>
      </button>
    </div>
  );
}
