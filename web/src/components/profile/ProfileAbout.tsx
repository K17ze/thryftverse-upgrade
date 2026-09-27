'use client';

/**
 * ProfileAbout — the About tab shared by the self and public profile
 * surfaces, ported from mobile StorefrontAboutTab / UserProfileAboutTab:
 * flat editorial rows — bio, website, then the shop-policies block.
 * The web carries no seller-authored announcement/policy overrides, so the
 * block shows the platform defaults mobile falls back to verbatim; nothing
 * else is invented.
 */

import Link from 'next/link';
import type { User } from '@/lib/contracts/domain';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';

interface ProfileAboutProps {
  user: User;
  variant: 'self' | 'public';
}

/** Normalize a stored website into a safe external href. */
function websiteHref(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

function AboutRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div className={`py-3.5 ${last ? '' : 'border-b border-border-subtle'}`}>
      <p className="text-meta font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <p className="mt-1 text-body text-text-primary">{value}</p>
    </div>
  );
}

export function ProfileAbout({ user, variant }: ProfileAboutProps) {
  const bio = user.bio?.trim();
  const website = user.website?.trim();
  const hasDetails = Boolean(bio || website);

  // Mobile rule: a bare public profile gets the honest empty state —
  // the policy block only renders once there is real content around it.
  if (variant === 'public' && !hasDetails) {
    return (
      <EmptyState
        icon="info"
        title="No additional details"
        subtitle={`@${user.username} hasn't added an about section yet.`}
        compact
      />
    );
  }

  return (
    <div className="px-4 pb-8 sm:px-6">
      {bio ? (
        <div className="pt-4">
          <h3 className="text-meta font-semibold uppercase tracking-wider text-text-muted">
            About
          </h3>
          <p className="mt-2 max-w-xl text-body text-text-primary">{bio}</p>
        </div>
      ) : null}

      {website ? (
        <a
          href={websiteHref(website)}
          target="_blank"
          rel="noopener noreferrer"
          className="pressable -mx-1 block rounded-md px-1 py-3.5"
        >
          <p className="text-meta font-semibold uppercase tracking-wider text-text-muted">
            Website
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-body text-text-primary">
            <span className="clamp-1">{website.replace(/^https?:\/\//i, '')}</span>
            <Icon name="forward" size={12} className="shrink-0 text-text-muted" />
          </p>
        </a>
      ) : null}

      {/* Shop policies — canonical home for the platform buyer terms,
          mirroring the mobile fallback copy. */}
      <div className="pt-5">
        <h3 className="pb-1 text-meta font-semibold uppercase tracking-wider text-text-muted">
          Shop policies
        </h3>
        <AboutRow label="Payments" value="Secure checkout with buyer protection" />
        <AboutRow label="Shipping" value="Tracking provided on dispatch." />
        <AboutRow label="Returns" value="Returns accepted for items not as described." />
        <AboutRow label="Response" value="Seller aims to respond promptly." last />
      </div>

      {variant === 'self' && !hasDetails ? (
        <p className="pt-4 text-body text-text-muted">
          You haven&apos;t added any details yet.
        </p>
      ) : null}

      {variant === 'self' ? (
        <Link
          href="/profile/edit"
          className="pressable mt-5 flex min-h-11 items-center justify-between text-body-emphasis font-semibold text-text-primary"
        >
          Edit shop details
          <Icon name="forward" size={14} className="text-text-muted" />
        </Link>
      ) : null}
    </div>
  );
}
