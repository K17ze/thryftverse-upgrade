'use client';

/**
 * FeedCategoryPills — department filters for the "More to explore"
 * masonry (UnifiedDiscoveryScreen parity: pills filter the feed, they
 * don't navigate). One Chip grammar, aria-pressed on the active
 * department, Rail edge fades while the row clips.
 *
 * Counts are fixture-truth and only render in fixture mode — the live
 * catalogue doesn't expose per-department totals at this scope, so a
 * live pill shows the name alone rather than a borrowed number.
 */

import { Chip } from '@/components/ui/Chip';
import { Rail } from '@/components/home/modules/Rail';
import { CATEGORY_DIRECTORY } from '@/components/search/taxonomy';
import { DATA_MODE } from '@/lib/api/client';

const LIVE = DATA_MODE === 'live';

interface FeedCategoryPillsProps {
  /** 'all' or a department slug from CATEGORY_DIRECTORY. */
  active: string;
  onChange: (slug: string) => void;
}

export function FeedCategoryPills({ active, onChange }: FeedCategoryPillsProps) {
  return (
    <Rail label="Filter by department" className="pb-1">
      <Chip
        selected={active === 'all'}
        onClick={() => onChange('all')}
        aria-label="All departments — show the full feed"
      >
        All
      </Chip>
      {CATEGORY_DIRECTORY.map((cat) => {
        const selected = active === cat.slug;
        const count = !LIVE && cat.count > 0 ? cat.count : null;
        return (
          <Chip
            key={cat.slug}
            selected={selected}
            onClick={() => onChange(cat.slug)}
            aria-label={
              count !== null
                ? `${cat.name} — ${count} item${count === 1 ? '' : 's'}`
                : cat.name
            }
          >
            {cat.name}
            {count !== null ? (
              <span
                aria-hidden
                className={`tnum text-meta ${
                  selected ? 'text-text-inverse/70' : 'text-text-muted'
                }`}
              >
                {count}
              </span>
            ) : null}
          </Chip>
        );
      })}
    </Rail>
  );
}
