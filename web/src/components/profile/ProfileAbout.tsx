'use client';

/**
 * ProfileAbout — the About tab shared by the self and public profile
 * surfaces, ported from mobile StorefrontAboutTab / UserProfileAboutTab:
 * flat editorial rows — bio, website, then the shop-policies block.
 * Seller-authored storefront policies (the profile aggregate's
 * storefront.policies) replace the platform defaults row-for-row when
 * present; rows the seller never wrote keep the mobile fallback copy.
 */

import Link from 'next/link';
import type { User } from '@/lib/contracts/domain';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';

/** Seller-authored policy copy from the storefront aggregate — null
 *  fields fall back to the platform defaults. */
export interface StorefrontPolicies {
  shipping: string | null;
  returns: string | null;
  additional: string | null;
}

interface ProfileAboutProps {
  user: User;
  variant: 'self' | 'public';
  policies?: StorefrontPolicies | null;
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
      <p className="text-meta font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className="mt-1 text-body text-text-primary">{value}</p>
    </div>
  );
}

export function ProfileAbout({ user, variant, policies }: ProfileAboutProps) {
  const bio = user.bio?.trim();
  const website = user.website?.trim();
  const shipping = policies?.shipping?.trim();
  const returns = policies?.returns?.trim();
  const additional = policies?.additional?.trim();
  // Seller-authored policy copy is real About content — it keeps the tab
  // out of the empty state even when bio/website are unset.
  const hasDetails = Boolean(bio || website || shipping || returns || additional);

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
    // Text surface — a reading column on wide canvases, not a sheet of
    // hairline rows stretched edge-to-edge.
    <div className="px-4 pb-8 sm:px-6 lg:max-w-2xl">
      {bio ? (
        <div className="pt-4">
          <h3 className="text-meta font-semibold uppercase tracking-wide text-text-muted">
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
          <p className="text-meta font-semibold uppercase tracking-wide text-text-muted">
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
        <h3 className="pb-1 text-meta font-semibold uppercase tracking-wide text-text-muted">
          Shop policies
        </h3>
        <AboutRow label="Payments" value="Secure checkout with buyer protection" />
        <AboutRow label="Shipping" value={shipping || 'Tracking provided on dispatch.'} />
        <AboutRow
          label="Returns"
          value={returns || 'Returns accepted for items not as described.'}
        />
        {additional ? <AboutRow label="Additional" value={additional} /> : null}
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
