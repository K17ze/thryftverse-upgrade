'use client';

/**
 * MemberResults — the member-matches block inside search results. The
 * placeholder promises "items, brands, members"; this makes the member
 * clause real. Rows come from the same member directory the inbox
 * composer searches (useMemberDirectory — username match, live mode hits
 * the users service). Nothing renders when nobody matches — the block is
 * absent, never empty.
 */

import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useMemberDirectory } from '@/lib/hooks/queries';

/** Member rows shown inline — the directory match is a directory, not a
 *  second results feed, so the block stays a scan-line, not a section. */
const MAX_ROWS = 4;

export function MemberResults({ query }: { query: string }) {
  const { data, isError, refetch } = useMemberDirectory(query);
  const members = (data ?? []).slice(0, MAX_ROWS);

  // A failed directory call is not an empty directory — show a retryable
  // error rather than silently hiding the block.
  if (isError) {
    return (
      <section aria-label="Members" className="px-4 pb-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 py-1">
          <p className="text-caption text-text-muted">
            Couldn&apos;t load member matches
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="pressable text-caption font-semibold text-brand"
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (members.length === 0) return null;

  return (
    <section aria-label="Members" className="px-4 pb-4 sm:px-6">
      <h2 className="text-label text-text-muted">
        Members
      </h2>
      {/* Two columns at lg — the member scan-line composes across the
          results column instead of stretching phone rows full-bleed. */}
      <ul className="mt-1 divide-y divide-border-subtle lg:grid lg:grid-cols-2 lg:gap-x-10 lg:divide-y-0">
        {members.map((m) => (
          <li key={m.id} className="lg:border-b lg:border-border-subtle">
            <Link
              href={`/u/${m.username}`}
              className="pressable -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-row"
            >
              <Avatar src={m.avatar} name={m.username} size={40} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  <span className="truncate text-body font-medium text-text-primary">
                    @{m.username}
                  </span>
                  {m.isVerified ? (
                    <Icon
                      name="verified"
                      size={13}
                      className="shrink-0 text-commerce-trust"
                    />
                  ) : null}
                </span>
                <span className="clamp-1 mt-0.5 block text-caption text-text-muted">
                  {[
                    m.listingCount > 0
                      ? `${m.listingCount} item${m.listingCount === 1 ? '' : 's'}`
                      : null,
                    m.reviewCount > 0
                      ? `★ ${m.rating.toFixed(1)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Member'}
                </span>
              </span>
              <Icon
                name="forward"
                size={15}
                className="shrink-0 text-text-muted"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
