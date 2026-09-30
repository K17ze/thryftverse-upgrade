'use client';

/**
 * Composer — chat input bar orchestrator.
 * Auto-growing textarea inside a 20px pill, photo / document attach,
 * voice note recording with waveform preview, role-scoped quick-reply picker,
 * quoted replies, and in-place message edit staging.
 * Factored into domain components (<400 LOC standard):
 *  - ComposerBanners
 *  - StagedAttachmentPreview
 *  - VoiceRecordingBar
 *  - QuickReplyMenu
 *  - ComposerInputBar
 *  - useTypingSignal
 *  - useVoiceRecorder
 *  - useComposerEditStash
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import type { SendChatMessageInput } from '@/lib/hooks/queries';
import { useToast } from '@/components/ui/Toast';
import { useQuickRepliesData } from '@/lib/hooks/chat-queries';
import { useHydrated } from '@/lib/store/useStore';
import { detectComposerSafetyWarning, type ChatSafetyWarning } from './chatSafety';
import { useChatDrafts } from './useChatDrafts';
import { VoiceRecordingBar } from './composer/VoiceRecordingBar';
import { StagedAttachmentPreview, type StagedAttachment } from './composer/StagedAttachmentPreview';
import { ComposerBanners, type ComposerReply } from './composer/ComposerBanners';
import { useTypingSignal } from './composer/useTypingSignal';
import { useVoiceRecorder } from './composer/useVoiceRecorder';
import { useComposerEditStash } from './composer/useComposerEditStash';
import { ComposerInputBar } from './composer/ComposerInputBar';

const MAX_HEIGHT = 128;

export interface ComposerProps {
  onSend: (input: SendChatMessageInput) => void;
  sending?: boolean;
  replyTo?: ComposerReply | null;
  onCancelReply?: () => void;
  editTarget?: { id: string; text: string } | null;
  onEditSubmit?: (messageId: string, text: string) => void;
  onCancelEdit?: () => void;
  threadId?: string;
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
  // Per-thread drafts — the mobile draftText grammar: text typed here is
  // owned by this conversation; switching threads swaps the draft and
  // the inbox row previews it as "Draft".
  const setDraft = useChatDrafts((s) => s.setDraft);
  const [staged, setStaged] = useState<StagedAttachment | null>(null);
  // The mobile useConversationSafety composer check — the draft scans on
  // every change; dismissal sticks per draft but resets the moment the
  // flagged text is gone so editing away and back re-warns.
  const [draftWarning, setDraftWarning] = useState<ChatSafetyWarning | null>(null);
  const [draftWarningDismissed, setDraftWarningDismissed] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const hydrated = useHydrated();
  // Quick replies come from the server when live (role-scoped, matching
  // the manage page's writes); the persisted local store is the fixture/
  // guest path only — never a fabricated synced list.
  const { replies } = useQuickRepliesData(quickReplyRole ?? undefined);
  const { noteKeystroke, stopTypingNow } = useTypingSignal(threadId);

  const {
    canRecord,
    recording,
    elapsedMs,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecorder({
    onStagedVoice: (voiceAttachment) => setStaged(voiceAttachment),
  });

  const grow = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, []);

  const { activeEdit, cancelEdit, clearResumed } = useComposerEditStash({
    threadId,
    editTarget,
    onCancelEdit,
    value,
    setValue,
    setStagedAttachment: setStaged,
    grow,
    areaRef,
  });

  // Picking a reply focuses the input — the quoted bar is the staging
  // area; sending clears it via the parent.
  useEffect(() => {
    if (replyTo) areaRef.current?.focus();
  }, [replyTo]);

  const submit = () => {
    if (sending) return;
    // The recipient's indicator clears the moment the message lands, not
    // 3s later — stop the signal before the send path runs.
    stopTypingNow();
    const text = value.trim();
    // Edit mode routes the submit to the edit write — an empty edit is a
    // no-op (the server would reject it anyway). A resumed edit has no
    // parent staging to clear, so it ends locally to pop the stash.
    if (activeEdit) {
      if (text) onEditSubmit?.(activeEdit.id, text);
      clearResumed();
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
    if (threadId) setDraft(threadId, '');
    // The draft is gone — the warning and its dismissal go with it.
    setDraftWarning(null);
    setDraftWarningDismissed(false);
    requestAnimationFrame(() => {
      if (areaRef.current) areaRef.current.style.height = 'auto';
    });
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

  const clearStaged = () => {
    if (staged) URL.revokeObjectURL(staged.uri);
    setStaged(null);
  };

  const handleQuickReply = (msg: string) => {
    setValue(msg);
    // Programmatic drafts bypass onChange — re-scan so a
    // saved template carrying risky grammar still warns.
    setDraftWarning(detectComposerSafetyWarning(msg));
    setDraftWarningDismissed(false);
    noteKeystroke(msg);
    requestAnimationFrame(() => {
      grow();
      areaRef.current?.focus();
    });
  };

  const handleTextChange = (text: string) => {
    setValue(text);
    // Draft persistence — plain typing only; an in-progress
    // edit's text is not the conversation's draft.
    if (!activeEdit && threadId) setDraft(threadId, text);
    // Mobile useConversationSafety: re-scan on every change; a
    // draft that no longer matches clears the warning AND the
    // dismissal, so re-typing risky text warns again.
    const w = detectComposerSafetyWarning(text);
    setDraftWarning(w);
    if (!w) setDraftWarningDismissed(false);
    noteKeystroke(text);
    grow();
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
          <ComposerInputBar
            activeEdit={activeEdit}
            sending={sending}
            canRecord={canRecord}
            hydrated={hydrated}
            quickReplyRole={quickReplyRole}
            replies={replies}
            value={value}
            staged={staged}
            areaRef={areaRef}
            fileRef={fileRef}
            docFileRef={docFileRef}
            replyTo={replyTo}
            onFileChange={onFile}
            onDocFileChange={onDocFile}
            onStartRecording={() => void startRecording()}
            onQuickReplySelect={handleQuickReply}
            onTextChange={handleTextChange}
            onSubmit={submit}
            onCancelEdit={cancelEdit}
            onCancelReply={onCancelReply}
          />
        )}
      </div>
    </form>
  );
}
