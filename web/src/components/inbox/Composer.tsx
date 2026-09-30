'use client';

/**
 * Composer — chat input bar orchestrator.
 * Auto-growing textarea inside a 20px pill, photo / document attach,
 * voice note recording with waveform preview, role-scoped quick-reply picker,
 * quoted replies, and in-place message edit staging.
 * Preserves optimistic send receipts, offline typing debounce, and safety scanners.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SendChatMessageInput } from '@/lib/hooks/queries';
import { DATA_MODE } from '@/lib/api/client';
import { setTypingStatus } from '@/lib/api/services/chat';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { useQuickRepliesData } from '@/lib/hooks/chat-queries';
import { useHydrated } from '@/lib/store/useStore';
import { detectComposerSafetyWarning, type ChatSafetyWarning } from './chatSafety';
import { useChatDrafts } from './useChatDrafts';
import { VoiceRecordingBar, waveformFor } from './composer/VoiceRecordingBar';
import { StagedAttachmentPreview, type StagedAttachment } from './composer/StagedAttachmentPreview';
import { QuickReplyMenu } from './composer/QuickReplyMenu';
import { ComposerBanners, type ComposerReply } from './composer/ComposerBanners';

const MAX_HEIGHT = 128;

type EditStashEntry =
  | { kind: 'draft'; text: string }
  | { kind: 'edit'; id: string; banner: string; text: string };

export interface ComposerProps {
  onSend: (input: SendChatMessageInput) => void;
  /** True while a send is in flight — controls disable, no double-send. */
  sending?: boolean;
  /** Staged reply target — renders the quoted compose bar until cleared. */
  replyTo?: ComposerReply | null;
  onCancelReply?: () => void;
  /** Staged edit — the composer's edit mode: prefills the textarea and routes submit. */
  editTarget?: { id: string; text: string } | null;
  onEditSubmit?: (messageId: string, text: string) => void;
  onCancelEdit?: () => void;
  /** Owning thread — clears stash on switch. */
  threadId?: string;
  /** Marketplace seat of the viewer in this thread for role-scoped quick replies. */
  quickReplyRole?: 'buyer' | 'seller' | null;
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
  quickReplyRole = null,
}: ComposerProps) {
  const toast = useToast();
  const [value, setValue] = useState('');
  const setDraft = useChatDrafts((s) => s.setDraft);
  const [staged, setStaged] = useState<StagedAttachment | null>(null);
  const [draftWarning, setDraftWarning] = useState<ChatSafetyWarning | null>(null);
  const [draftWarningDismissed, setDraftWarningDismissed] = useState(false);

  // Voice capture state & refs
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef(0);
  const recordCancelledRef = useRef(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const hydrated = useHydrated();
  const canRecord =
    hydrated &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia;

  const [resumedEdit, setResumedEdit] = useState<{ id: string; text: string } | null>(null);
  const activeEdit = editTarget ?? resumedEdit;

  const { replies } = useQuickRepliesData(quickReplyRole ?? undefined);

  // ── Typing status realtime broadcast ──────────────────────────────
  const typingOn = useRef(false);
  const typingStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const postTyping = useCallback(
    (on: boolean) => {
      if (!threadId || DATA_MODE !== 'live' || typingOn.current === on) return;
      typingOn.current = on;
      setTypingStatus(threadId, on).catch(() => undefined);
    },
    [threadId],
  );

  const clearTypingTimers = useCallback(() => {
    if (typingStartTimer.current) {
      clearTimeout(typingStartTimer.current);
      typingStartTimer.current = null;
    }
    if (typingStopTimer.current) {
      clearTimeout(typingStopTimer.current);
      typingStopTimer.current = null;
    }
  }, []);

  const stopTypingNow = useCallback(() => {
    clearTypingTimers();
    postTyping(false);
  }, [clearTypingTimers, postTyping]);

  const noteKeystroke = useCallback(
    (next: string) => {
      if (!threadId || DATA_MODE !== 'live') return;
      if (typingStopTimer.current) {
        clearTimeout(typingStopTimer.current);
        typingStopTimer.current = null;
      }
      if (next.length > 0) {
        if (!typingOn.current && !typingStartTimer.current) {
          typingStartTimer.current = setTimeout(() => {
            typingStartTimer.current = null;
            postTyping(true);
          }, 1000);
        }
        typingStopTimer.current = setTimeout(() => {
          typingStopTimer.current = null;
          postTyping(false);
        }, 3000);
      } else {
        if (typingStartTimer.current) {
          clearTimeout(typingStartTimer.current);
          typingStartTimer.current = null;
        }
        postTyping(false);
      }
    },
    [threadId, postTyping],
  );

  useEffect(() => {
    return () => {
      clearTypingTimers();
      if (threadId && DATA_MODE === 'live' && typingOn.current) {
        typingOn.current = false;
        setTypingStatus(threadId, false).catch(() => undefined);
      }
    };
  }, [threadId, clearTypingTimers]);

  // Voice recording Escape key listener
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

  // Recording elapsed clock
  useEffect(() => {
    if (!recording) return;
    setElapsedMs(Date.now() - recordStartRef.current);
    const id = setInterval(
      () => setElapsedMs(Date.now() - recordStartRef.current),
      250,
    );
    return () => clearInterval(id);
  }, [recording]);

  // Unmount voice cleanup
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

  useEffect(() => {
    if (replyTo) areaRef.current?.focus();
  }, [replyTo]);

  const grow = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, []);

  // ── Edit staging & stack management ───────────────────────────────
  const editStash = useRef<EditStashEntry[]>([]);
  const stagedEditId = useRef<string | null>(null);
  const stagedEditBanner = useRef('');
  const valueRef = useRef(value);
  valueRef.current = value;

  const stashThread = useRef(threadId);
  if (stashThread.current !== threadId) {
    stashThread.current = threadId;
    editStash.current = [];
    stagedEditId.current = null;
    stagedEditBanner.current = '';
    if (resumedEdit) setResumedEdit(null);
  }

  const draftRafIds = useRef<number[]>([]);
  useEffect(() => {
    const raf = (fn: () => void) => {
      const id = requestAnimationFrame(() => {
        draftRafIds.current = draftRafIds.current.filter((x) => x !== id);
        fn();
      });
      draftRafIds.current.push(id);
    };
    const nextDraft = threadId
      ? (useChatDrafts.getState().drafts[threadId] ?? '')
      : '';
    if (nextDraft !== valueRef.current) {
      setValue(nextDraft);
      raf(grow);
    }
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
      raf(() => areaRef.current?.focus());
    }
    return () => {
      draftRafIds.current.forEach((id) => cancelAnimationFrame(id));
      draftRafIds.current = [];
    };
  }, [threadId, grow]);

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
      if (threadId) setDraft(threadId, entry?.text ?? '');
      requestAnimationFrame(grow);
    }
  }, [activeEdit, grow, threadId, setDraft]);

  const cancelEdit = () => {
    if (resumedEdit) setResumedEdit(null);
    onCancelEdit?.();
  };

  // ── Submit message / edit ──────────────────────────────────────────
  const submit = () => {
    if (sending) return;
    stopTypingNow();
    const text = value.trim();
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
    if (threadId) setDraft(threadId, '');
    setDraftWarning(null);
    setDraftWarningDismissed(false);
    requestAnimationFrame(() => {
      if (areaRef.current) areaRef.current.style.height = 'auto';
    });
  };

  // ── Media pickers ──────────────────────────────────────────────────
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

  const handleQuickReply = (msg: string) => {
    setValue(msg);
    setDraftWarning(detectComposerSafetyWarning(msg));
    setDraftWarningDismissed(false);
    noteKeystroke(msg);
    requestAnimationFrame(() => {
      grow();
      areaRef.current?.focus();
    });
  };

  return (
    <form
      data-chat-composer
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="shrink-0 border-t border-border-subtle bg-background"
    >
      <div className="mx-auto w-full lg:max-w-3xl">
        <ComposerBanners
          activeEdit={activeEdit}
          onCancelEdit={cancelEdit}
          replyTo={replyTo}
          onCancelReply={onCancelReply}
          warning={draftWarning}
          warningDismissed={draftWarningDismissed}
          onDismissWarning={() => setDraftWarningDismissed(true)}
          disabled={sending}
        />

        <StagedAttachmentPreview staged={staged} onClear={clearStaged} />

        {recording ? (
          <VoiceRecordingBar
            elapsedMs={elapsedMs}
            onCancel={cancelRecording}
            onStop={stopRecording}
          />
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

            {!activeEdit ? (
              <>
                <IconButton
                  name="image"
                  aria-label="Attach a photo"
                  onClick={() => fileRef.current?.click()}
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

                {hydrated && quickReplyRole ? (
                  <QuickReplyMenu
                    replies={replies}
                    disabled={sending}
                    onSelect={handleQuickReply}
                  />
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
                  if (!activeEdit && threadId) setDraft(threadId, e.target.value);
                  const w = detectComposerSafetyWarning(e.target.value);
                  setDraftWarning(w);
                  if (!w) setDraftWarningDismissed(false);
                  noteKeystroke(e.target.value);
                  grow();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  } else if (e.key === 'Escape' && activeEdit) {
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
              aria-label={
                sending
                  ? 'Sending message'
                  : activeEdit
                    ? 'Save edit'
                    : 'Send message'
              }
              className="pressable -my-0.5 flex h-11 w-11 shrink-0 items-center justify-center disabled:pointer-events-none disabled:opacity-40"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-text-inverse">
                <Icon
                  name={sending ? 'clock' : activeEdit ? 'check' : 'send'}
                  size={18}
                />
              </span>
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
