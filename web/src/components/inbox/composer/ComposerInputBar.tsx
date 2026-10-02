import type { RefObject, ChangeEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { QuickReplyMenu, type QuickReplyItem } from './QuickReplyMenu';
import type { StagedAttachment } from './StagedAttachmentPreview';
import type { ComposerReply } from './ComposerBanners';

interface ComposerInputBarProps {
  activeEdit: { id: string; text: string } | null;
  sending: boolean;
  canRecord: boolean;
  hydrated: boolean;
  quickReplyRole: 'buyer' | 'seller' | null;
  replies: QuickReplyItem[];
  value: string;
  staged: StagedAttachment | null;
  areaRef: RefObject<HTMLTextAreaElement | null>;
  fileRef: RefObject<HTMLInputElement | null>;
  docFileRef: RefObject<HTMLInputElement | null>;
  replyTo?: ComposerReply | null;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onDocFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onStartRecording: () => void;
  onQuickReplySelect: (msg: string) => void;
  onTextChange: (value: string) => void;
  onSubmit: () => void;
  onCancelEdit: () => void;
  onCancelReply?: () => void;
}

export function ComposerInputBar({
  activeEdit,
  sending,
  canRecord,
  hydrated,
  quickReplyRole,
  replies,
  value,
  staged,
  areaRef,
  fileRef,
  docFileRef,
  replyTo,
  onFileChange,
  onDocFileChange,
  onStartRecording,
  onQuickReplySelect,
  onTextChange,
  onSubmit,
  onCancelEdit,
  onCancelReply,
}: ComposerInputBarProps) {
  return (
    <div className="flex items-end gap-1 px-2 py-2 md:px-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={onFileChange}
      />
      <input
        ref={docFileRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx,.md,.rtf,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,application/zip"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={onDocFileChange}
      />

      {/* Attachment + quick-reply controls are send-path — edits are
          text-only so all of them hide while an edit is staged. The mic
          renders only where MediaRecorder + getUserMedia actually exist. */}
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
              onClick={onStartRecording}
              disabled={sending}
            />
          ) : null}

          {/* Native grammar: the strip only exists on marketplace
              threads (a listing context resolves a buyer/seller seat).
              The menu mounts even when the list is empty so the
              "Manage quick replies" affordance stays reachable. */}
          {hydrated && quickReplyRole ? (
            <QuickReplyMenu
              replies={replies}
              disabled={sending}
              onSelect={onQuickReplySelect}
            />
          ) : null}
        </>
      ) : null}

      <div className="min-w-0 flex-1 rounded-chat border border-transparent bg-surface-alt px-4 py-1.5 transition-colors focus-within:border-border">
        <textarea
          ref={areaRef}
          rows={1}
          value={value}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter mid-IME-composition commits the candidate, not the
            // message — let the IME own the keypress.
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            } else if (e.key === 'Escape' && activeEdit) {
              // Escape cancels the staged edit before the staged reply.
              e.preventDefault();
              onCancelEdit();
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
  );
}
