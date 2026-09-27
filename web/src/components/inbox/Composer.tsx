'use client';

/**
 * Composer — chat input bar. Auto-growing textarea inside a 20px pill,
 * photo attach that stages a local preview before sending (remove before
 * it goes out), quick-reply bolt picker, brand send button enabled with
 * text or a staged photo. A picked reply rides as a quoted bar above the
 * input (the mobile ReplyQuote grammar — brand edge, sender, one-line
 * preview) until × or Escape cancels it. Enter sends, Shift+Enter
 * newline; the send and attach controls disable while a send is in
 * flight — the optimistic bubble's clock receipt carries the honest
 * in-flight state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { SendChatMessageInput } from '@/lib/hooks/queries';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { useQuickReplies } from '@/lib/store/quickReplies';
import { useHydrated } from '@/lib/store/useStore';
import { ChatSafetyBanner } from './ChatSafetyBanner';
import { detectComposerSafetyWarning, type ChatSafetyWarning } from './chatSafety';

const MAX_HEIGHT = 128;

/** m:ss for the recording bar and the staged voice chip. */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Staged attachment — what the composer holds before send. The pick is a
 * local File + blob: preview; live mode uploads the File (presign → PUT →
 * finalize) and posts the canonical URI, fixture mode keeps the blob so
 * the thread renders the real bytes.
 */
type StagedAttachment =
  | { kind: 'image'; uri: string; file: File }
  | { kind: 'document'; uri: string; file: File; name: string; mimeType: string }
  | {
      kind: 'voice';
      uri: string;
      file: File;
      durationMs: number;
      waveform?: number[];
    };

/**
 * Best-effort waveform — decodes the recorded blob and buckets ~36 peak
 * samples (the mobile voiceWaveform shape). Decode support varies by
 * browser/container, so failure honestly ships no waveform rather than a
 * fabricated one.
 */
async function waveformFor(file: File): Promise<{ durationMs?: number; waveform?: number[] }> {
  try {
    const Ctx =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

interface ComposerReply {
  senderName: string;
  text: string;
}

/**
 * Edit-stash entry — what the composer held when a new edit was staged.
 * A plain draft stores just its text; an in-progress edit stores the
 * message id, its original body (the edit bar's preview line) and the
 * in-progress replacement text, so leaving the newer edit resumes it.
 */
type EditStashEntry =
  | { kind: 'draft'; text: string }
  | { kind: 'edit'; id: string; banner: string; text: string };

interface ComposerProps {
  onSend: (input: SendChatMessageInput) => void;
  /** True while a send is in flight — controls disable, no double-send. */
  sending?: boolean;
  /** Staged reply target — renders the quoted compose bar until cleared. */
  replyTo?: ComposerReply | null;
  onCancelReply?: () => void;
  /** Staged edit — the composer's edit mode (mobile composer edit
   *  banner): prefills the textarea, shows an "Edit message" bar, and
   *  routes submit to onEditSubmit until cancelled. */
  editTarget?: { id: string; text: string } | null;
  onEditSubmit?: (messageId: string, text: string) => void;
  onCancelEdit?: () => void;
  /** Owning thread — the edit stash and any stash-resumed edit belong to
   *  one conversation's messages, so they clear when the thread changes. */
  threadId?: string;
}

export function Composer({
  onSend,
  sending = false,
  replyTo,
  onCancelReply,
  editTarget,
  onEditSubmit,
  onCancelEdit,
  threadId,
}: ComposerProps) {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [staged, setStaged] = useState<StagedAttachment | null>(null);
  const [repliesOpen, setRepliesOpen] = useState(false);
  // The mobile useConversationSafety composer check — the draft scans on
  // every change; dismissal sticks per draft but resets the moment the
  // flagged text is gone so editing away and back re-warns.
  const [draftWarning, setDraftWarning] = useState<ChatSafetyWarning | null>(null);
  const [draftWarningDismissed, setDraftWarningDismissed] = useState(false);
  // Voice capture — MediaRecorder + getUserMedia, feature-detected so the
  // mic control honestly never renders where the browser can't record.
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef(0);
  const recordCancelledRef = useRef(false);
  const docFileRef = useRef<HTMLInputElement>(null);
  // Declared before `canRecord` — the capability gate reads it.
  const hydrated = useHydrated();
  const canRecord =
    hydrated &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia;
  // An edit resumed from the stash — the parent's staging is already
  // clear for it, so the composer tracks it locally. `text` here is the
  // original body (the edit bar's preview), matching editTarget's shape.
  const [resumedEdit, setResumedEdit] = useState<{ id: string; text: string } | null>(null);
  const activeEdit = editTarget ?? resumedEdit;
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const repliesWrapRef = useRef<HTMLDivElement>(null);
  const repliesBtnRef = useRef<HTMLButtonElement>(null);
  const replies = useQuickReplies((s) => s.replies);

  useEffect(() => {
    if (!repliesOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (repliesWrapRef.current && !repliesWrapRef.current.contains(e.target as Node)) {
        setRepliesOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Focus goes back to the trigger — the menu Escape contract.
        setRepliesOpen(false);
        repliesBtnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    // Menu grammar: focus moves into the menu on open (the FeedItemMenu
    // pattern) so the keyboard sequence starts at the first reply.
    repliesWrapRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus();
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [repliesOpen]);

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

  // Picking a reply focuses the input — the quoted bar is the staging
  // area; sending clears it via the parent.
  useEffect(() => {
    if (replyTo) areaRef.current?.focus();
  }, [replyTo]);

  const grow = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, []);

  // Entering edit mode prefills the textarea with the message body and
  // focuses it; a staged photo is dropped (edits are text-only). The
  // composer's prior contents are pushed onto a stash stack — a plain
  // draft pushes { kind: 'draft' }, an in-progress edit pushes
  // { kind: 'edit' } — so A → B → end resumes A's edit rather than
  // silently replacing the stashed draft. The current draft is read
  // through a ref so the effect deps stay honest.
  const editStash = useRef<EditStashEntry[]>([]);
  const stagedEditId = useRef<string | null>(null);
  const stagedEditBanner = useRef('');
  const valueRef = useRef(value);
  valueRef.current = value;

  // Thread switch — stash entries and a resumed edit reference message
  // ids from the conversation they came from; carrying them into a new
  // thread would edit the wrong message, so the local edit state clears
  // (the plain draft keeps its existing carry-over behaviour).
  const stashThread = useRef(threadId);
  if (stashThread.current !== threadId) {
    stashThread.current = threadId;
    editStash.current = [];
    stagedEditId.current = null;
    stagedEditBanner.current = '';
    if (resumedEdit) setResumedEdit(null);
  }

  useEffect(() => {
    const activeId = activeEdit?.id ?? null;
    if (stagedEditId.current === activeId) return;
    const focusComposer = () =>
      requestAnimationFrame(() => {
        grow();
        const el = areaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    if (activeEdit) {
      // A fresh parent-staged edit (resumed edits short-circuit above —
      // the pop already set stagedEditId to the resumed id).
      editStash.current.push(
        stagedEditId.current === null
          ? { kind: 'draft', text: valueRef.current }
          : {
              kind: 'edit',
              id: stagedEditId.current,
              banner: stagedEditBanner.current,
              text: valueRef.current,
            },
      );
      stagedEditId.current = activeEdit.id;
      stagedEditBanner.current = activeEdit.text;
      setValue(activeEdit.text);
      setStaged(null);
      focusComposer();
      return;
    }
    // The active edit ended — pop the stash. An interrupted edit resumes
    // composer-side (the parent's staging is already clear); a plain
    // draft restores as text.
    stagedEditId.current = null;
    stagedEditBanner.current = '';
    const entry = editStash.current.pop();
    if (entry?.kind === 'edit') {
      stagedEditId.current = entry.id;
      stagedEditBanner.current = entry.banner;
      setResumedEdit({ id: entry.id, text: entry.banner });
      setValue(entry.text);
      focusComposer();
    } else {
      setResumedEdit(null);
      setValue(entry?.text ?? '');
      requestAnimationFrame(grow);
    }
  }, [activeEdit, grow]);

  // × / Escape end the staged edit — a stash-resumed edit isn't in the
  // parent's staging, so clearing it locally unwinds the stash the same
  // way a parent-driven cancel does.
  const cancelEdit = () => {
    if (resumedEdit) setResumedEdit(null);
    onCancelEdit?.();
  };

  const submit = () => {
    if (sending) return;
    const text = value.trim();
    // Edit mode routes the submit to the edit write — an empty edit is a
    // no-op (the server would reject it anyway). A resumed edit has no
    // parent staging to clear, so it ends locally to pop the stash.
    if (activeEdit) {
      if (text) onEditSubmit?.(activeEdit.id, text);
      if (resumedEdit) setResumedEdit(null);
      return;
    }
    if (!text && !staged) return;
    onSend({
      text: text || undefined,
      mediaUri: staged?.uri,
      mediaType: staged?.kind === 'image' ? 'image' : staged?.kind,
      // The File rides along so live mode can upload the staged pick —
      // a blob: URI alone means nothing to the server.
      file: staged?.file,
      documentName: staged?.kind === 'document' ? staged.name : undefined,
      documentMimeType:
        staged?.kind === 'document' ? staged.mimeType : undefined,
      voiceDurationMs:
        staged?.kind === 'voice' ? staged.durationMs : undefined,
      voiceWaveform: staged?.kind === 'voice' ? staged.waveform : undefined,
    });
    setValue('');
    setStaged(null);
    // The draft is gone — the warning and its dismissal go with it.
    setDraftWarning(null);
    setDraftWarningDismissed(false);
    requestAnimationFrame(() => {
      if (areaRef.current) areaRef.current.style.height = 'auto';
    });
  };

  const pickPhoto = () => {
    fileRef.current?.click();
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.show('Only photos can be shared here', 'info');
      return;
    }
    setStaged({ kind: 'image', uri: URL.createObjectURL(file), file });
  };

  /**
   * Document pick — the backend's 'document' message type carries
   * documentName/documentMimeType in metadata alongside the uploaded
   * mediaUri. No type allowlist beyond "not an image/video" — the staged
   * chip shows exactly what will be sent (name + MIME), and the send
   * fails honestly if the upload is rejected.
   */
  const onDocFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      toast.show('Use the photo button for images and videos', 'info');
      return;
    }
    setStaged({
      kind: 'document',
      uri: URL.createObjectURL(file),
      file,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
    });
  };

  // ── Voice capture — real MediaRecorder flow: record → stop stages a
  // playable chip (the same preview-before-send grammar as a photo);
  // cancel discards. ──────────────────────────────────────────────────

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
    setStaged({
      kind: 'voice',
      uri: URL.createObjectURL(file),
      file,
      durationMs: decoded.durationMs ?? elapsed,
      waveform: decoded.waveform,
    });
  };

  const stopRecording = () => {
    recordCancelledRef.current = false;
    recorderRef.current?.stop();
  };

  const cancelRecording = () => {
    recordCancelledRef.current = true;
    recorderRef.current?.stop();
  };

  const clearStaged = () => {
    if (staged) URL.revokeObjectURL(staged.uri);
    setStaged(null);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="shrink-0 border-t border-border-subtle bg-background"
    >
      {/* Edit staging — the mobile composer edit banner: same edge/sender/
          preview grammar as the reply bar, Escape or × cancels. */}
      {activeEdit ? (
        <div className="flex items-stretch gap-2 px-3 pt-2.5 md:px-4">
          <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-md border border-border bg-surface">
            <span className="w-[3px] self-stretch rounded-sm bg-brand" aria-hidden />
            <span className="min-w-0 flex-1 px-2.5 py-2">
              <span className="block text-meta font-semibold text-brand">Edit message</span>
              <span className="clamp-1 block text-caption text-text-secondary">
                {activeEdit.text}
              </span>
            </span>
          </div>
          <IconButton
            name="close"
            size={16}
            aria-label="Cancel edit"
            onClick={cancelEdit}
            disabled={sending}
          />
        </div>
      ) : null}
      {/* Quoted reply — the mobile ReplyQuote grammar: brand edge, sender
          name, one-line preview, × dismisses (Escape does the same from
          the input). */}
      {!activeEdit && replyTo ? (
        <div className="flex items-stretch gap-2 px-3 pt-2.5 md:px-4">
          <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-md border border-border bg-surface">
            <span className="w-[3px] self-stretch rounded-sm bg-brand" aria-hidden />
            <span className="min-w-0 flex-1 px-2.5 py-2">
              <span className="block text-meta font-semibold text-brand">
                {replyTo.senderName}
              </span>
              <span className="clamp-1 block text-caption text-text-secondary">
                {replyTo.text}
              </span>
            </span>
          </div>
          <IconButton
            name="close"
            size={16}
            aria-label="Cancel reply"
            onClick={() => onCancelReply?.()}
            disabled={sending}
          />
        </div>
      ) : null}
      {/* Staged attachment — WhatsApp's preview-before-send. The pick is a
          local blob URL: images render a thumb, documents a filename chip,
          voice a playable clip — each honest about what will be sent. */}
      {staged ? (
        <div className="flex items-center gap-2 px-3 pt-2.5 md:px-4">
          {staged.kind === 'image' ? (
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md">
              {/* eslint-disable-next-line @next/next/no-img-element -- local pick, not optimizable */}
              <img src={staged.uri} alt="Photo ready to send" className="h-full w-full object-cover" />
            </div>
          ) : staged.kind === 'document' ? (
            <div className="flex min-w-0 items-center gap-2.5 rounded-md border border-border bg-surface px-2.5 py-2">
              <Icon name="document" size={20} className="shrink-0 text-brand" />
              <span className="min-w-0">
                <span className="clamp-1 block max-w-[220px] text-body font-medium text-text-primary">
                  {staged.name}
                </span>
                <span className="clamp-1 block text-meta text-text-muted">
                  {staged.mimeType}
                </span>
              </span>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2.5 rounded-md border border-border bg-surface px-2.5 py-2">
              <Icon name="mic" size={18} className="shrink-0 text-brand" />
              <span className="min-w-0">
                <span className="block text-body font-medium text-text-primary">
                  Voice note
                </span>
                <span className="tnum block text-meta text-text-muted">
                  {formatElapsed(staged.durationMs)}
                </span>
              </span>
              <audio
                src={staged.uri}
                controls
                preload="metadata"
                className="h-9 max-w-[200px]"
              />
            </div>
          )}
          <IconButton
            name="close"
            size={16}
            aria-label={`Remove ${staged.kind}`}
            className="h-9 w-9"
            onClick={clearStaged}
          />
        </div>
      ) : null}
      {/* Draft safety warning — the mobile inline composer strip: danger/
          caution while the draft carries off-platform-payment or urgency
          grammar. Dismissible, non-blocking — send always proceeds (the
          mobile semantics: warn, never prevent). */}
      {draftWarning && !draftWarningDismissed ? (
        <div className="px-3 pt-2.5 md:px-4">
          <ChatSafetyBanner
            warning={draftWarning}
            onDismiss={() => setDraftWarningDismissed(true)}
          />
        </div>
      ) : null}
      {recording ? (
        /* Recording bar — swaps in for the input row while the mic is
           live: pulsing dot, elapsed readout, cancel / stop-and-stage. */
        <div className="flex items-center gap-1 px-2 py-2 md:px-3" role="status">
          <IconButton
            name="close"
            aria-label="Discard voice recording"
            onClick={cancelRecording}
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
            onClick={stopRecording}
            aria-label="Stop recording"
            className="pressable -my-0.5 flex h-11 w-11 shrink-0 items-center justify-center"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-text-inverse">
              <Icon name="stop" size={18} />
            </span>
          </button>
        </div>
      ) : (
      <div className="flex items-end gap-1 px-2 py-2 md:px-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={onFile}
        />
        <input
          ref={docFileRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx,.md,.rtf,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,application/zip"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={onDocFile}
        />
        {/* Attachment + quick-reply controls are send-path — edits are
            text-only so all of them hide while an edit is staged. The mic
            renders only where MediaRecorder + getUserMedia actually exist. */}
        {!activeEdit ? (
          <>
            <IconButton
              name="image"
              aria-label="Attach a photo"
              onClick={pickPhoto}
              disabled={sending}
            />
            <IconButton
              name="document"
              aria-label="Attach a document"
              onClick={() => docFileRef.current?.click()}
              disabled={sending}
            />
            {canRecord ? (
              <IconButton
                name="mic"
                aria-label="Record a voice note"
                onClick={() => void startRecording()}
                disabled={sending}
              />
            ) : null}
            {hydrated && replies.length > 0 ? (
          <div ref={repliesWrapRef} className="relative shrink-0">
            <IconButton
              ref={repliesBtnRef}
              name="zap"
              aria-label="Quick replies"
              aria-expanded={repliesOpen}
              aria-haspopup="menu"
              onClick={() => setRepliesOpen((o) => !o)}
              disabled={sending}
            />
            {repliesOpen ? (
              <div
                role="menu"
                onKeyDown={(e) => {
                  if (e.key !== 'Tab') return;
                  // Menu grammar (the FeedItemMenu fix): close, return
                  // focus to the trigger, then let the browser's default
                  // tab step continue from it — an open menu left past its
                  // Tab position strands the tab order.
                  setRepliesOpen(false);
                  repliesBtnRef.current?.focus();
                }}
                className="absolute bottom-full left-0 mb-2 w-72 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
              >
                <p className="px-3.5 pb-1 pt-2 text-micro font-semibold uppercase tracking-wide text-text-muted">
                  Quick replies
                </p>
                {replies.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setValue(r.message);
                      // Programmatic drafts bypass onChange — re-scan so a
                      // saved template carrying risky grammar still warns.
                      setDraftWarning(detectComposerSafetyWarning(r.message));
                      setDraftWarningDismissed(false);
                      setRepliesOpen(false);
                      requestAnimationFrame(() => {
                        grow();
                        areaRef.current?.focus();
                      });
                    }}
                    className="pressable block w-full px-3.5 py-2.5 text-left hover:bg-row-pressed"
                  >
                    <span className="block text-body font-semibold text-text-primary">{r.title}</span>
                    <span className="clamp-1 mt-0.5 block text-meta text-text-muted">{r.message}</span>
                  </button>
                ))}
                <Link
                  href="/seller-hub/quick-replies"
                  className="block border-t border-border-subtle px-3.5 py-2.5 text-body font-semibold text-text-primary hover:bg-row-pressed"
                >
                  Manage quick replies
                </Link>
              </div>
            ) : null}
          </div>
            ) : null}
          </>
        ) : null}
        <div className="min-w-0 flex-1 rounded-chat border border-transparent bg-surface-alt px-4 py-1.5 transition-colors focus-within:border-border">
          <textarea
            ref={areaRef}
            rows={1}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              // Mobile useConversationSafety: re-scan on every change; a
              // draft that no longer matches clears the warning AND the
              // dismissal, so re-typing risky text warns again.
              const w = detectComposerSafetyWarning(e.target.value);
              setDraftWarning(w);
              if (!w) setDraftWarningDismissed(false);
              grow();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              } else if (e.key === 'Escape' && activeEdit) {
                // Escape cancels the staged edit before the staged reply.
                e.preventDefault();
                cancelEdit();
              } else if (e.key === 'Escape' && replyTo) {
                e.preventDefault();
                onCancelReply?.();
              }
            }}
            placeholder={activeEdit ? 'Edit message…' : 'Message…'}
            aria-label={activeEdit ? 'Edit message' : 'Message'}
            className="max-h-32 w-full resize-none bg-transparent py-1.5 text-body text-input-text placeholder:text-text-muted focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={sending || (!value.trim() && !staged)}
          aria-label={sending ? 'Sending message' : activeEdit ? 'Save edit' : 'Send message'}
          className="pressable -my-0.5 flex h-11 w-11 shrink-0 items-center justify-center disabled:pointer-events-none disabled:opacity-40"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-text-inverse">
            <Icon name={sending ? 'clock' : activeEdit ? 'check' : 'send'} size={18} />
          </span>
        </button>
      </div>
      )}
    </form>
  );
}
