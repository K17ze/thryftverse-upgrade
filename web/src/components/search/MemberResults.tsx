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
  const { data } = useMemberDirectory(query);
  const members = (data ?? []).slice(0, MAX_ROWS);
  if (members.length === 0) return null;

  return (
    <section aria-label="Members" className="px-4 pb-4 sm:px-6">
      <h2 className="text-label font-semibold uppercase tracking-wide text-text-muted">
        Members
      </h2>
      <ul className="mt-1 divide-y divide-border-subtle">
        {members.map((m) => (
          <li key={m.id}>
            <Link
              href={`/u/${m.username}`}
              className="pressable -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-alt"
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
                      className="shrink-0 text-success-text"
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
