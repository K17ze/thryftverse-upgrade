'use client';

/**
 * VoiceAttachment — playable voice note with waveform representation,
 * private signed grant resolution, and opt-in automated transcription with feedback.
 */

import { useEffect, useRef, useState } from 'react';
import type { Message } from '@/lib/contracts/domain';
import {
  fetchVoicePlaybackUrl,
  fetchVoiceTranscription,
  rateVoiceTranscription,
  requestVoiceTranscription,
  type VoiceTranscriptionReceipt,
} from '@/lib/api/services/chat';
import { DATA_MODE } from '@/lib/api/client';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';

/** m:ss for voice durations — 0:00 renders as "0:00" stays honest. */
export function formatVoiceDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

interface VoiceAttachmentProps {
  m: Message;
  mine: boolean;
  conversationId?: string;
}

/**
 * Voice message — play/pause toggle driving a hidden audio element, the
 * server waveform rendered as bars when present, duration when known.
 * A voice row with no URI and no duration falls back to the plain label
 * rather than a dead control.
 */
export function VoiceAttachment({
  m,
  mine,
  conversationId,
}: VoiceAttachmentProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const grantRef = useRef<{ url: string; expiresAt: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [resolving, setResolving] = useState(false);
  const toast = useToast();
  const duration =
    m.voiceDurationMs != null ? formatVoiceDuration(m.voiceDurationMs) : '';
  const bars = (m.voiceWaveform ?? []).slice(0, 36);
  const metaTone = mine ? 'text-text-inverse/80' : 'text-text-muted';

  // Live voice media sits in a private bucket — the wire's mediaUri is
  // an identifier, not a playable URL. Playback resolves through the
  // membership-bound signed grant (revocable, TTL'd; mobile
  // useVoicePlayer parity). Fixture-mode voiceUri is already playable.
  const needsGrant = DATA_MODE === 'live' && Boolean(conversationId);
  const playable = needsGrant ? true : Boolean(m.voiceUri);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a || resolving) return;
    if (playing) {
      a.pause();
      return;
    }
    if (needsGrant) {
      const grant = grantRef.current;
      // Refetch inside a 4s pre-expiry window — a grant that dies
      // mid-play leaves a silent element.
      if (!grant || grant.expiresAt <= Date.now() + 4000) {
        setResolving(true);
        try {
          const g = await fetchVoicePlaybackUrl(
            conversationId as string,
            m.id,
          );
          grantRef.current = {
            url: g.playbackUrl,
            expiresAt: Date.parse(g.expiresAt) || Date.now() + 50_000,
          };
          a.src = g.playbackUrl;
        } catch {
          setResolving(false);
          toast.show("Couldn't play the voice message — try again", 'error');
          return;
        }
        setResolving(false);
      }
    }
    try {
      await a.play();
    } catch {
      setPlaying(false);
    }
  };

  return (
    <span className="block min-w-[150px] py-0.5">
      <span className="flex items-center gap-2">
        {playable ? (
          <>
            <button
              type="button"
              onClick={() => void toggle()}
              disabled={resolving}
              aria-label={playing ? 'Pause voice message' : 'Play voice message'}
              className="pressable -m-1.5 flex h-11 w-11 shrink-0 items-center justify-center"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  mine
                    ? 'bg-text-inverse text-brand'
                    : 'bg-brand text-text-inverse'
                }`}
              >
                {resolving ? (
                  <Spinner size={14} tone="inherit" />
                ) : (
                  <Icon name={playing ? 'pause' : 'play'} size={14} filled />
                )}
              </span>
            </button>
            <audio
              ref={audioRef}
              src={needsGrant ? undefined : m.voiceUri}
              preload="none"
              className="hidden"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
          </>
        ) : (
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              mine
                ? 'bg-text-inverse/20 text-text-inverse'
                : 'bg-surface text-text-muted'
            }`}
          >
            <Icon name="mic" size={14} />
          </span>
        )}
        {bars.length > 0 ? (
          <span
            className="flex h-7 min-w-0 flex-1 items-center gap-[2px]"
            aria-hidden
          >
            {bars.map((v, i) => (
              <span
                key={i}
                className={`w-[2px] shrink-0 rounded-full ${
                  mine ? 'bg-text-inverse/60' : 'bg-text-muted'
                }`}
                style={{
                  height: `${Math.min(100, Math.max(12, v <= 1 ? v * 100 : v))}%`,
                }}
              />
            ))}
          </span>
        ) : (
          <span className={`text-meta ${metaTone}`}>Voice message</span>
        )}
        {duration ? (
          <span className={`tnum shrink-0 text-meta ${metaTone}`}>
            {duration}
          </span>
        ) : null}
      </span>
      {needsGrant && conversationId ? (
        <VoiceTranscriptRow
          conversationId={conversationId}
          messageId={m.id}
          mine={mine}
        />
      ) : null}
    </span>
  );
}

/**
 * VoiceTranscriptRow — the opt-in transcript surface (mobile
 * VoiceTranscriptionPanel parity). Never auto-fetched: the user taps
 * "Show transcript", the backend either replays the existing row or
 * queues a job (idempotent). Processing polls until the worker lands;
 * the text always carries the "Automatically transcribed" provenance
 * label and a binary quality rating — never presented as the sender's
 * exact words.
 */
function VoiceTranscriptRow({
  conversationId,
  messageId,
  mine,
}: {
  conversationId: string;
  messageId: string;
  mine: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    | 'loading'
    | 'processing'
    | 'complete'
    | 'failed_retryable'
    | 'failed_final'
    | 'unsupported'
  >('loading');
  const [receipt, setReceipt] = useState<VoiceTranscriptionReceipt | null>(null);
  const [rating, setRating] = useState<'good' | 'bad' | null>(null);
  const tone = mine ? 'text-text-inverse/80' : 'text-text-muted';

  const applyReceipt = (t: VoiceTranscriptionReceipt) => {
    setReceipt(t);
    setRating(t.rating);
    setState(
      t.state === 'complete'
        ? 'complete'
        : t.state === 'queued' || t.state === 'processing'
          ? 'processing'
          : t.state === 'failed_retryable'
            ? 'failed_retryable'
            : t.state === 'failed_final'
              ? 'failed_final'
              : 'unsupported',
    );
  };

  // The worker lands async — poll while the job is queued/processing.
  useEffect(() => {
    if (state !== 'processing') return;
    let dead = false;
    const timer = setInterval(() => {
      fetchVoiceTranscription(conversationId, messageId)
        .then((latest) => {
          if (!dead && latest) applyReceipt(latest);
        })
        .catch(() => {
          /* network blip — keep polling */
        });
    }, 2500);
    return () => {
      dead = true;
      clearInterval(timer);
    };
  }, [state, conversationId, messageId]);

  const expand = async () => {
    setOpen(true);
    setState('loading');
    try {
      const existing = await fetchVoiceTranscription(conversationId, messageId);
      applyReceipt(
        existing ??
          (await requestVoiceTranscription(conversationId, messageId)),
      );
    } catch {
      setState('failed_retryable');
    }
  };

  const retry = async () => {
    setState('loading');
    try {
      applyReceipt(
        await requestVoiceTranscription(conversationId, messageId),
      );
    } catch {
      setState('failed_retryable');
    }
  };

  const rate = (value: 'good' | 'bad') => {
    if (rating === value) return;
    setRating(value);
    rateVoiceTranscription(conversationId, messageId, value).catch(() => {
      setRating(null);
      /* silent — a rating miss isn't worth a toast mid-thread */
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => void expand()}
        className={`pressable mt-1 text-meta font-semibold underline decoration-transparent hover:decoration-current ${tone}`}
      >
        Show transcript
      </button>
    );
  }

  return (
    <span
      className={`mt-1.5 block rounded-md border px-2.5 py-2 ${
        mine ? 'border-text-inverse/30' : 'border-border-subtle'
      }`}
    >
      {state === 'loading' || state === 'processing' ? (
        <span className="flex items-center justify-between gap-3">
          <span className={`flex items-center gap-1.5 text-meta ${tone}`}>
            <Spinner size={12} tone="inherit" />
            {state === 'loading'
              ? 'Requesting transcript…'
              : 'Transcribing audio…'}
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close transcript"
            className={`pressable -m-1 flex h-7 w-7 items-center justify-center ${tone}`}
          >
            <Icon name="close" size={13} />
          </button>
        </span>
      ) : state === 'complete' ? (
        <>
          <span
            className={`block whitespace-pre-wrap text-meta ${
              mine ? 'text-text-inverse' : 'text-text-primary'
            }`}
          >
            {receipt?.text || '(empty transcript)'}
          </span>
          <span className="mt-1 flex items-center justify-between gap-3">
            <span className={`text-micro ${tone}`}>
              Automatically transcribed
            </span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => rate('good')}
                aria-label="Mark transcription as accurate"
                aria-pressed={rating === 'good'}
                className={`pressable flex h-7 w-7 items-center justify-center rounded-full ${
                  rating === 'good' ? 'bg-brand-subtle text-brand' : tone
                }`}
              >
                <Icon name="check" size={13} />
              </button>
              <button
                type="button"
                onClick={() => rate('bad')}
                aria-label="Mark transcription as inaccurate"
                aria-pressed={rating === 'bad'}
                className={`pressable flex h-7 w-7 items-center justify-center rounded-full ${
                  rating === 'bad' ? 'bg-danger-subtle text-danger-text' : tone
                }`}
              >
                <Icon name="close" size={13} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close transcript"
                className={`pressable flex h-7 w-7 items-center justify-center ${tone}`}
              >
                <Icon name="chevronUp" size={13} />
              </button>
            </span>
          </span>
        </>
      ) : (
        <span className="flex items-center justify-between gap-3">
          <span className={`text-meta ${tone}`}>
            {state === 'unsupported'
              ? "Transcription isn't available for this voice message."
              : state === 'failed_final'
                ? (receipt?.failureReason ?? 'Transcription failed.')
                : (receipt?.failureReason ?? "Couldn't transcribe — ") ||
                  'Couldn’t transcribe.'}
          </span>
          {state === 'failed_retryable' ? (
            <button
              type="button"
              onClick={() => void retry()}
              className={`pressable shrink-0 text-meta font-semibold underline decoration-transparent hover:decoration-current ${tone}`}
            >
              Retry
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close transcript"
              className={`pressable -m-1 flex h-7 w-7 shrink-0 items-center justify-center ${tone}`}
            >
              <Icon name="close" size={13} />
            </button>
          )}
        </span>
      )}
    </span>
  );
}
