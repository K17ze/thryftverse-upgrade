'use client';

import type { User } from '@/lib/contracts/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { BioText } from './BioText';
import {
  formatMemberSince,
  memberSinceFor,
  verificationTierFor,
  VERIFICATION_BADGE,
} from '../profileViewModel';

/** Normalize a stored website into a safe external href. */
export function websiteHref(website: string): string {
  const trimmed = website.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

interface ProfileHeroIdentityProps {
  user: User;
  hasCoverBand: boolean;
  children?: React.ReactNode;
}

export function ProfileHeroIdentity({ user, hasCoverBand, children }: ProfileHeroIdentityProps) {
  const memberSince = formatMemberSince(user.createdAt) ?? memberSinceFor(user.id);
  const verificationTier = verificationTierFor(user);
  const displayName = user.displayName?.trim() || null;

  return (
    <div
      className={`flex items-start gap-4 sm:gap-6 lg:gap-10 ${
        hasCoverBand ? '-mt-12 lg:mt-0' : 'pt-6 lg:pt-8'
      }`}
    >
      <Avatar
        src={user.avatar}
        name={user.username}
        size={96}
        className={`lg:hidden ${hasCoverBand ? 'ring-4 ring-background' : 'ring-1 ring-border'}`}
      />
      {/* Desktop avatar — IG's ~150px identity anchor. Duplicated (not
          CSS-scaled) so the image srcset resolves at the real size. */}
      <span
        className={`hidden shrink-0 lg:block ${hasCoverBand ? 'lg:-mt-[75px]' : ''}`}
        aria-hidden="true"
      >
        <Avatar
          src={user.avatar}
          name={user.username}
          size={150}
          className={hasCoverBand ? 'ring-4 ring-background' : 'ring-1 ring-border'}
        />
      </span>

      <div className={`min-w-0 flex-1 ${hasCoverBand ? 'lg:pt-5' : ''}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <h1 className="text-item-title font-bold text-text-primary sm:text-screen-title lg:text-hero">
            {displayName ?? user.username}
          </h1>
          {user.isVerified ? (
            <Icon
              name="verified"
              filled
              size={18}
              className="text-commerce-trust"
              aria-label="Verified member"
            />
          ) : null}
          {verificationTier ? (
            <Badge
              variant={VERIFICATION_BADGE[verificationTier].variant}
              icon={VERIFICATION_BADGE[verificationTier].icon}
            >
              {VERIFICATION_BADGE[verificationTier].label}
            </Badge>
          ) : null}
          {user.badges.map((b) => (
            <Badge
              key={b}
              variant={b === 'Top Seller' ? 'trust' : 'neutral'}
              icon={b === 'Top Seller' ? 'shieldCheck' : undefined}
            >
              {b}
            </Badge>
          ))}
        </div>

        {/* Secondary handle — only when a display name owns the
            headline (native ProfileHero grammar). */}
        {displayName ? (
          <p className="mt-0.5 text-body text-text-secondary">@{user.username}</p>
        ) : null}

        {user.bio ? <BioText bio={user.bio} /> : null}

        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-meta text-text-muted">
          <Icon name="location" size={13} />
          {user.location}
          {user.lastSeen ? (
            <>
              <span aria-hidden>·</span>
              Active {user.lastSeen}
            </>
          ) : null}
          {memberSince ? (
            <>
              <span aria-hidden>·</span>
              Joined {memberSince}
            </>
          ) : null}
        </p>

        {user.website ? (
          <p className="mt-1 flex items-center gap-1.5 text-meta">
            <Icon name="link" size={12} className="text-text-muted" />
            <a
              href={websiteHref(user.website)}
              target="_blank"
              rel="noopener noreferrer"
              className="clamp-1 font-medium text-text-secondary hover:text-text-primary hover:underline"
            >
              {user.website.replace(/^https?:\/\//i, '')}
            </a>
          </p>
        ) : null}

        {children}
      </div>
    </div>
  );
}
