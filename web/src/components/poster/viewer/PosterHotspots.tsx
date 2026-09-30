'use client';

import Link from 'next/link';
import type { PosterTag } from '@/lib/data/fixtures-posters';

interface PosterHotspotsProps {
  tags: PosterTag[];
}

export function PosterHotspots({ tags }: PosterHotspotsProps) {
  if (tags.length === 0) return null;

  return (
    <>
      {tags.map((tag) => (
        <Link
          key={tag.id}
          href={`/item/${tag.listingId}`}
          className="group absolute z-elevated"
          style={{ left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }}
          aria-label={`Shop ${tag.label}`}
        >
          <span className="block -translate-x-1/2 -translate-y-1/2 p-3">
            <span className="block h-3 w-3 rounded-full bg-brand ring-2 ring-white/80 transition-transform group-hover:scale-110" />
          </span>
          <span className="absolute left-1/2 top-4 block -translate-x-1/2 whitespace-nowrap rounded-full bg-overlay px-2.5 py-1 text-micro font-semibold text-scrim-text-primary">
            {tag.label}
          </span>
        </Link>
      ))}
    </>
  );
}
