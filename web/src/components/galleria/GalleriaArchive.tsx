'use client';

/**
 * GalleriaArchive — past issues as a compact grid. Cover thumb, issue line,
 * serif title, date. Non-interactive by design: the archive is a record,
 * not a rail (mirrors mobile's non-interactive render path).
 */

import { AppImage } from '@/components/ui/AppImage';
import { formatDate } from '@/lib/utils/format';
import type { GalleriaArchiveIssue } from '@/lib/data/fixtures-media';

export function GalleriaArchive({ issues }: { issues: GalleriaArchiveIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul role="list" className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
      {issues.map((issue) => (
        <li key={issue.id}>
          <div className="relative w-full overflow-hidden rounded-md">
            <AppImage
              src={issue.coverUri}
              alt={`${issue.issueLabel} — ${issue.title}`}
              fill
              aspectRatio={4 / 5}
              focalPoint={issue.focalPoint}
              className="h-full w-full"
              sizes="(max-width: 1024px) 50vw, 25vw"
            />
          </div>
          <p className="mt-2.5 text-meta text-text-muted">
            {issue.issueLabel} · {formatDate(issue.publishedAt)}
          </p>
          <h3 className="clamp-1 mt-0.5 text-item-title text-text-primary">
            {issue.title}
          </h3>
        </li>
      ))}
    </ul>
  );
}
