'use client';

/**
 * DocumentAttachment — downloadable file attachment row with filename,
 * MIME type metadata, and brand/inverse styling based on sender ownership.
 */

import type { Message } from '@/lib/contracts/domain';
import { Icon } from '@/components/ui/Icon';

interface DocumentAttachmentProps {
  m: Message;
  mine: boolean;
}

export function DocumentAttachment({ m, mine }: DocumentAttachmentProps) {
  const cls = `flex min-w-[170px] items-center gap-2.5 rounded-lg border px-2.5 py-2 ${
    mine ? 'border-text-inverse/40' : 'border-border-subtle'
  }`;

  const inner = (
    <>
      <Icon
        name="document"
        size={20}
        className={`shrink-0 ${mine ? 'text-text-inverse' : 'text-brand'}`}
      />
      <span className="min-w-0 flex-1">
        <span className="clamp-1 block text-body font-medium">
          {m.documentName ?? 'Document'}
        </span>
        {m.documentMimeType ? (
          <span
            className={`clamp-1 block text-meta ${
              mine ? 'text-text-inverse/70' : 'text-text-muted'
            }`}
          >
            {m.documentMimeType}
          </span>
        ) : null}
      </span>
      <Icon
        name="download"
        size={14}
        className={`shrink-0 ${
          mine ? 'text-text-inverse/70' : 'text-text-muted'
        }`}
      />
    </>
  );

  return m.documentUri ? (
    <a
      href={m.documentUri}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open document ${m.documentName ?? ''}`.trim()}
      className={cls}
    >
      {inner}
    </a>
  ) : (
    <span className={cls}>{inner}</span>
  );
}
