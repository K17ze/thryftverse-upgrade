'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type {
  StorefrontEditorState,
  StorefrontStatusAction,
} from '@/lib/hooks/seller-queries';
import { formatDate } from '@/lib/utils/format';

interface StorefrontStatusBannerProps {
  sf: StorefrontEditorState;
  status: 'draft' | 'published' | 'paused';
  statusCopy: { label: string; variant: 'neutral' | 'success' | 'warning'; line: string };
  busy: boolean;
  canPublish: boolean;
  isPublishing: boolean;
  onStatusAction: (action: StorefrontStatusAction) => void;
  onRequestRollback: () => void;
}

export function StorefrontStatusBanner({
  sf,
  status,
  statusCopy,
  busy,
  canPublish,
  isPublishing,
  onStatusAction,
  onRequestRollback,
}: StorefrontStatusBannerProps) {
  return (
    <>
      <section
        aria-label="Publication status"
        className="mt-8 flex flex-wrap items-center justify-between gap-3 border-y border-border-subtle py-3.5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <Badge variant={statusCopy.variant}>{statusCopy.label}</Badge>
          <p className="text-meta text-text-muted">
            {status === 'published' && sf.publishedAt
              ? `${statusCopy.line} Since ${formatDate(sf.publishedAt ?? undefined)}.`
              : statusCopy.line}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status === 'published' ? (
            <>
              <Button
                variant="outline"
                size="sm"
                icon="pause"
                disabled={busy}
                onClick={() => onStatusAction('pause')}
              >
                Pause
              </Button>
              <Button
                variant="quiet"
                size="sm"
                disabled={busy}
                onClick={onRequestRollback}
              >
                Revert to draft
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              icon="eye"
              disabled={busy || !canPublish}
              onClick={() => onStatusAction('publish')}
            >
              {isPublishing ? 'Publishing…' : 'Publish'}
            </Button>
          )}
        </div>
      </section>
      {status !== 'published' && !canPublish ? (
        <p className="mt-2 flex items-start gap-1.5 text-meta text-text-muted">
          <Icon name="info" size={14} className="mt-px shrink-0" />
          Pin at least one item below to publish — an empty shop can&apos;t go live.
        </p>
      ) : null}
    </>
  );
}
