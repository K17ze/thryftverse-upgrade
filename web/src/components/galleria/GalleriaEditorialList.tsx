'use client';

/**
 * GalleriaEditorialList — the issue's table of contents. Rows carry index,
 * thumbnail, serif headline, dek, and a meta column (read time · date);
 * hairline separators, no card surfaces. Each row opens the reader Sheet.
 * Mirrors GalleriaEditorialListItem's reading-action grammar on mobile.
 */

import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { formatDate } from '@/lib/utils/format';
import type { GalleriaEditorial } from '@/lib/data/fixtures-media';

interface GalleriaEditorialListProps {
  editorials: GalleriaEditorial[];
  onOpen: (editorial: GalleriaEditorial) => void;
}

function EditorialRow({
  editorial,
  index,
  onOpen,
}: {
  editorial: GalleriaEditorial;
  index: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="pressable group flex w-full items-center gap-4 py-5 text-left sm:gap-6 sm:py-6"
      aria-label={`Read ${editorial.title} — ${editorial.readMinutes} min read`}
    >
      {/* TOC index */}
      <span className="tnum w-7 shrink-0 text-meta font-medium text-text-muted">
        {String(index + 1).padStart(2, '0')}
      </span>

      {/* Thumbnail */}
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md sm:h-20 sm:w-28">
        <AppImage
          src={editorial.heroUri}
          alt={editorial.title}
          fill
          focalPoint={editorial.focalPoint}
          className="h-full w-full"
          sizes="112px"
        />
      </div>

      {/* Headline + dek */}
      <div className="min-w-0 flex-1">
        <p className="text-label font-semibold uppercase tracking-[0.14em] text-text-muted">
          {editorial.kicker}
        </p>
        <h3 className="clamp-2 mt-1 text-editorial-title text-text-primary">
          {editorial.title}
        </h3>
        <p className="mt-1 line-clamp-1 text-body text-text-secondary sm:line-clamp-2">
          {editorial.dek}
        </p>
        <p className="mt-1.5 text-meta text-text-muted sm:hidden">
          {editorial.author.name} · {editorial.readMinutes} min
        </p>
      </div>

      {/* Meta column — desktop TOC grammar */}
      <div className="hidden shrink-0 flex-col items-end gap-1 text-meta text-text-muted sm:flex">
        <span>{editorial.readMinutes} min read</span>
        <span>{formatDate(editorial.publishedAt)}</span>
      </div>

      <Icon
        name="forward"
        size={18}
        className="shrink-0 text-text-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-text-secondary"
      />
    </button>
  );
}

export function GalleriaEditorialList({ editorials, onOpen }: GalleriaEditorialListProps) {
  return (
    <ul className="mt-2" role="list">
      {editorials.map((editorial, index) => (
        <li key={editorial.id} className="border-b border-border-subtle last:border-b-0">
          <EditorialRow
            editorial={editorial}
            index={index}
            onOpen={() => onOpen(editorial)}
          />
        </li>
      ))}
    </ul>
  );
}
