'use client';

/**
 * ProfileHero — shared identity block for own and public profiles.
 * Flat canvas, cover with legibility scrims, 96px seam avatar (mobile's
 * 96–128pt contract), name + verified + trust badges, linkified bio with
 * see-more truncation, website + context meta, flat-typography stats strip,
 * and the action row per variant.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { Listing, User } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import {
  ClosetMediaMosaic,
  closetMosaicCells,
  CLOSET_MOSAIC_MIN,
} from '@/components/closet/ClosetMediaMosaic';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import { useCreateConversation } from '@/lib/hooks/queries';
import { formatCount } from '@/lib/utils/format';
import { FollowButton } from './FollowButton';
import { ProfileOptionsMenu } from './ProfileOptionsMenu';
import { RatingStars } from './RatingStars';
import { useShare } from './useShare';
import { formatMemberSince, memberSinceFor, verificationTierFor, VERIFICATION_BADGE } from './profileViewModel';

/** Profile stat seams that can route somewhere when the parent opts in. */
export type ProfileStatKey = 'items' | 'sold' | 'reviews';

/** Viewer-scoped flags from the profile aggregate (live mode) — feeds the
 *  options menu's mute/restrict/block row labels. */
export interface ProfileViewerState {
  isMuted?: boolean;
  isRestricted?: boolean;
  isBlocked?: boolean;
  /** Server-side DM permission (blocks, messaging settings, privacy) —
   *  false disables the Message CTA rather than failing on send. */
  canMessage?: boolean;
}

interface ProfileHeroProps {
  user: User;
  /** Live listing count wins over the fixture's cached listingCount. */
  listingCount?: number;
  /** Active (for-sale) count — when provided the lead stat reads "for sale"
   *  instead of the generic "items". */
  forSaleCount?: number;
  /** Sold count — rendered as its own stat when provided (0 included). */
  soldCount?: number;
  variant: 'self' | 'public';
  /** Stat seams that land on profile content (mobile FRESH-06): items/sold
   *  select the shop segment, reviews selects the reviews tab. Absent =
   *  plain text. */
  onStatPress?: (stat: ProfileStatKey) => void;
  /** The member's listings — when no authored cover photo exists and the
   *  closet carries enough usable stills, the cover band composes a media
   *  mosaic of real listing covers instead of staying empty. */
  closetMedia?: Listing[];
  /** Viewer relationship state — public variant only; lands on the
   *  options menu when provided. */
  viewer?: ProfileViewerState;
}

// ── Bio — linkified + see-more truncated, mirrors mobile BioText ──
// URLs open externally, @mentions route to the member's profile, and
// hashtags stay inert text (no hashtag surface exists). Long bios collapse
// to 200 chars with a trailing "more" toggle.
const BIO_TRUNCATE_CHARS = 200;
const BIO_LINK_PATTERN =
  /((?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+[^\s]*|@[\w.]+)/g;

interface BioSegment {
  text: string;
  kind: 'text' | 'url' | 'mention';
}

function bioSegments(bio: string): BioSegment[] {
  const out: BioSegment[] = [];
  let last = 0;
  const pattern = new RegExp(BIO_LINK_PATTERN.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(bio)) !== null) {
    if (m.index > last) out.push({ text: bio.slice(last, m.index), kind: 'text' });
    const token = m[0];
    out.push({
      text: token,
      kind: token.startsWith('@') ? 'mention' : 'url',
    });
    last = m.index + token.length;
  }
  if (last < bio.length) out.push({ text: bio.slice(last), kind: 'text' });
  return out.length > 0 ? out : [{ text: bio, kind: 'text' }];
}

function BioText({ bio }: { bio: string }) {
  const [expanded, setExpanded] = useState(false);
  const truncate = bio.length > BIO_TRUNCATE_CHARS;
  const shown = truncate && !expanded ? `${bio.slice(0, BIO_TRUNCATE_CHARS).trimEnd()}…` : bio;
  const segments = useMemo(() => bioSegments(shown), [shown]);

  return (
    <p className="mt-1.5 max-w-xl text-body text-text-primary">
      {segments.map((seg, i) =>
        seg.kind === 'mention' ? (
          <Link
            key={i}
            href={`/u/${seg.text.slice(1)}`}
            className="font-medium text-text-primary hover:underline"
          >
            {seg.text}
          </Link>
        ) : seg.kind === 'url' ? (
          <a
            key={i}
            href={/^https?:\/\//i.test(seg.text) ? seg.text : `https://${seg.text}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {seg.text}
          </a>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
      {truncate ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="font-semibold text-text-secondary hover:text-text-primary"
          aria-label={expanded ? 'Show less bio' : 'Show more bio'}
        >
          {expanded ? ' less' : ' more'}
        </button>
      ) : null}
    </p>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="tnum text-body-emphasis font-bold text-text-primary">
        {formatCount(value)}
      </span>
      <span className="text-body text-text-muted">{label}</span>
    </span>
  );
}

/** Quiet pressable wrapper for stats that route somewhere — same hover
 *  grammar as the followers/following links. */
function StatPress({
  onPress,
  label,
  children,
}: {
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      className="pressable rounded-sm hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
    >
      {children}
    </button>
  );
}

/** Normalize a stored website into a safe external href. */
function websiteHref(website: string): string {
  const trimmed = website.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function ProfileHero({ user, listingCount, forSaleCount, soldCount, variant, onStatPress, closetMedia, viewer }: ProfileHeroProps) {
  const router = useRouter();
  const { show } = useToast();
  const share = useShare();
  const { requireAuth, wall } = useSignupWall();
  const createConversation = useCreateConversation();
  // The live aggregate carries the real createdAt — the fixture lookup
  // stays as the fixture-mode fallback (members carry no createdAt).
  const memberSince = formatMemberSince(user.createdAt) ?? memberSinceFor(user.id);
  const verificationTier = verificationTierFor(user);
  // Native grammar: the display name leads when the member set one; the
  // @handle drops to the secondary line. Without a display name the
  // username stays the identity anchor.
  const displayName = user.displayName?.trim() || null;

  // Cover band: authored cover media wins (a cover video plays a muted
  // loop over the photo fallback); a deep closet composes a media mosaic
  // of its own listing covers; a thin closet degrades honestly to the
  // identity-only hero.
  const mosaicCells = useMemo(() => closetMosaicCells(closetMedia ?? []), [closetMedia]);
  const hasCoverMedia = Boolean(user.coverPhoto || user.coverVideo);
  const showMosaic = !hasCoverMedia && mosaicCells.length >= CLOSET_MOSAIC_MIN;
  const hasCoverBand = hasCoverMedia || showMosaic;

  /** Instagram parity — Message creates the DM when none exists and
   *  deep-links straight into the thread, never just the inbox list. */
  const messageUser = async () => {
    if (!requireAuth('message_seller')) return;
    try {
      const conversation = await createConversation.mutateAsync({
        memberIds: [user.id],
      });
      router.push(`/inbox/${conversation.id}`);
    } catch {
      show('Could not open the conversation', 'error');
    }
  };

  const shareProfile = () =>
    share({
      url: `${window.location.origin}/u/${user.username}`,
      title: `@${user.username} on ThryftVerse`,
      copiedLabel: 'Profile link copied',
    });

  const itemsStat = (
    <Stat
      value={forSaleCount ?? listingCount ?? user.listingCount}
      label={forSaleCount != null ? 'for sale' : 'items'}
    />
  );
  const ratingStat = (
    <span className="flex items-center gap-1.5">
      <RatingStars rating={user.rating} size={13} />
      <span className="tnum text-body font-semibold text-text-primary">
        {user.rating.toFixed(1)}
      </span>
      <span className="text-meta text-text-muted">
        ({formatCount(user.reviewCount)})
      </span>
    </span>
  );

  return (
    <section aria-label={`@${user.username} profile`}>
      {/* Full-bleed cover band — the banner breaks out of the content
          column to span the viewport edge-to-edge at every breakpoint
          (eBay shop-banner / Depop cover grammar). The -translate breakout
          is safe because the document root clips overflow-x. */}
      {hasCoverMedia ? (
        <div className="relative left-1/2 h-36 w-screen -translate-x-1/2 overflow-hidden sm:h-48 lg:h-64 xl:h-72">
          {/* Contained-crop art direction: portrait covers keep the
              upper-third subject instead of a dead-centre slice. Scoped
              to lg+ so the mobile crop stays untouched. */}
          {user.coverPhoto ? (
            <AppImage
              src={user.coverPhoto}
              alt=""
              fill
              sizes="100vw"
              imgClassName="lg:object-[50%_35%]"
              className="h-full w-full"
              priority
            />
          ) : null}
          {/* Cover video — muted ambient loop layered over the photo,
              which stays mounted as poster + load-error fallback
              (mobile FlagshipProfileMedia coverVideoUri grammar). */}
          {user.coverVideo ? (
            <video
              src={user.coverVideo}
              poster={user.coverPhoto}
              autoPlay
              muted
              loop
              playsInline
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover lg:object-[50%_35%]"
            />
          ) : null}
          {/* Media scrims — top fade for floating-control contrast, bottom
              fade softens the avatar seam (mobile ProfileHeaderHero grammar). */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/30 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/10 to-transparent"
          />
        </div>
      ) : showMosaic ? (
        <ClosetMediaMosaic
          cells={mosaicCells}
          ownerId={user.id}
          username={user.username}
          itemCount={listingCount ?? user.listingCount}
        />
      ) : null}

      <div className="px-4 sm:px-6">
        {/* IG/Depop desktop grammar: a larger avatar column with the
            identity block beside it — never a centered stack. The avatar
            alone bridges the cover seam (half its diameter, mobile's seam
            contract scaled to the 150px desktop anchor); the identity text
            stays on the flat canvas below the cover — nothing competes
            with the photo for contrast. */}
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

            {/* Stats strip — flat typography, not stat cards. Seams with a
                destination are quiet buttons (mobile FRESH-06). */}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 lg:gap-x-7">
              {onStatPress ? (
                <StatPress onPress={() => onStatPress('items')} label="View listings">
                  {itemsStat}
                </StatPress>
              ) : (
                itemsStat
              )}
              {typeof soldCount === 'number' ? (
                onStatPress ? (
                  <StatPress onPress={() => onStatPress('sold')} label="View sold items">
                    <Stat value={soldCount} label="sold" />
                  </StatPress>
                ) : (
                  <Stat value={soldCount} label="sold" />
                )
              ) : null}
              <Link
                href={`/u/${user.username}/followers`}
                className="rounded-sm hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
              >
                <Stat value={user.followers} label="followers" />
              </Link>
              <Link
                href={`/u/${user.username}/following`}
                className="rounded-sm hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
              >
                <Stat value={user.following} label="following" />
              </Link>
              {onStatPress && user.reviewCount > 0 ? (
                <StatPress onPress={() => onStatPress('reviews')} label="View reviews">
                  {ratingStat}
                </StatPress>
              ) : (
                ratingStat
              )}
            </div>

            {/* Actions — one grammar: primary intent + quiet affordances */}
            <div className="mt-4 flex items-center gap-1">
              {variant === 'self' ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    icon="edit"
                    className="mr-1"
                    onClick={() => router.push('/profile/edit')}
                  >
                    Edit
                  </Button>
                  <Button variant="secondary" size="sm" icon="share" onClick={shareProfile}>
                    Share shop
                  </Button>
                  <IconButton
                    name="store"
                    aria-label="Manage listings"
                    onClick={() => router.push('/seller-hub/listings')}
                  />
                  <IconButton
                    name="layers"
                    aria-label="Collections"
                    onClick={() => router.push('/collections')}
                  />
                  <IconButton
                    name="settings"
                    aria-label="Settings"
                    onClick={() => router.push('/settings')}
                  />
                </>
              ) : (
                <>
                  {/* Message is the conversion action (the filled control);
                      Follow is the quiet stateful affordance — mobile hero
                      grammar, not the IG pill row. `canMessage` is the
                      server's DM permission — false hides the CTA rather
                      than dead-ending on send (blocked/private accounts). */}
                  {viewer?.canMessage !== false ? (
                    <Button
                      variant="primary"
                      size="sm"
                      icon="chat"
                      className="mr-1"
                      disabled={createConversation.isPending}
                      onClick={() => void messageUser()}
                    >
                      Message
                    </Button>
                  ) : null}
                  <FollowButton
                    userId={user.id}
                    size="sm"
                    idleVariant="secondary"
                    className="mr-1 min-w-[104px]"
                  />
                  <IconButton name="share" aria-label="Share profile" onClick={shareProfile} />
                  <ProfileOptionsMenu user={user} viewer={viewer} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {wall}
    </section>
  );
}
