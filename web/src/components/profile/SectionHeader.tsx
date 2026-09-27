'use client';

/**
 * ProfileSectionHeader — quiet section label for closet/board blocks.
 * Hairline-free: label + optional count and a trailing accessory (segment
 * control, quiet link). Typography does the work, not containers.
 */

interface ProfileSectionHeaderProps {
  title: string;
  /** Item count shown as "N items" beside the title. */
  count?: number;
  /** Trailing accessory — segment control or quiet affordance. */
  accessory?: React.ReactNode;
}

export function ProfileSectionHeader({ title, count, accessory }: ProfileSectionHeaderProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pb-3 pt-1 sm:px-6">
      <h2 className="text-section-title font-semibold text-text-primary">
        {title}
        {typeof count === 'number' ? (
          <span className="tnum ml-2 text-meta font-normal text-text-muted">
            {count} {count === 1 ? 'item' : 'items'}
          </span>
        ) : null}
      </h2>
      {accessory}
    </div>
  );
}
