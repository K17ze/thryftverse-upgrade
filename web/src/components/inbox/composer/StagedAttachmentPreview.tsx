'use client';

/**
 * StagedAttachmentPreview — WhatsApp / Messenger style preview-before-send.
 * Displays local blob previews for images, document chips with metadata,
 * or voice clips with native audio playback before the user commits to sending.
 */

import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { formatElapsed } from './VoiceRecordingBar';

/**
 * Staged attachment — what the composer holds before send. The pick is a
 * local File + blob: preview; live mode uploads the File (presign → PUT →
 * finalize) and posts the canonical URI, fixture mode keeps the blob so
 * the thread renders the real bytes.
 */
export type StagedAttachment =
  | { kind: 'image'; uri: string; file: File }
  | { kind: 'document'; uri: string; file: File; name: string; mimeType: string }
  | {
      kind: 'voice';
      uri: string;
      file: File;
      durationMs: number;
      waveform?: number[];
    };

interface StagedAttachmentPreviewProps {
  staged: StagedAttachment | null;
  onClear: () => void;
}

export function StagedAttachmentPreview({
  staged,
  onClear,
}: StagedAttachmentPreviewProps) {
  if (!staged) return null;

  return (
    <div className="flex items-center gap-2 px-3 pt-2.5 md:px-4">
      {staged.kind === 'image' ? (
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border-subtle bg-surface-alt">
          {/* eslint-disable-next-line @next/next/no-img-element -- local pick, not optimizable */}
          <img
            src={staged.uri}
            alt="Photo ready to send"
            className="h-full w-full object-cover"
          />
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
        className="-my-1 shrink-0"
        onClick={onClear}
      />
    </div>
  );
}
