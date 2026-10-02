'use client';

/**
 * ProfileHero — shared identity block for own and public profiles.
 * Flat canvas, cover with legibility scrims, 96px seam avatar (mobile's
 * 96–128pt contract), name + verified + trust badges, linkified bio with
 * see-more truncation, website + context meta, flat-typography stats strip,
 * and the action row per variant.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Listing, User } from '@/lib/contracts/domain';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import { useCreateConversation } from '@/lib/hooks/queries';
import { closetMosaicCells, CLOSET_MOSAIC_MIN } from '@/components/closet/ClosetMediaMosaic';
import { SharePassportSheet } from './SharePassportSheet';
import { ProfileCoverBand } from './hero/ProfileCoverBand';
import { ProfileHeroIdentity } from './hero/ProfileHeroIdentity';
import { ProfileStatsStrip, type ProfileStatKey } from './hero/ProfileStatsStrip';
import { ProfileHeroActions, type ProfileViewerState } from './hero/ProfileHeroActions';

export type { ProfileStatKey } from './hero/ProfileStatsStrip';
export type { ProfileViewerState } from './hero/ProfileHeroActions';
export { BioText, bioSegments } from './hero/BioText';
export { Stat, StatPress } from './hero/ProfileStatsStrip';
export { websiteHref } from './hero/ProfileHeroIdentity';

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

export function ProfileHero({
  user,
  listingCount,
  forSaleCount,
  soldCount,
  variant,
  onStatPress,
  closetMedia,
  viewer,
}: ProfileHeroProps) {
  const router = useRouter();
  const { show } = useToast();
  const { requireAuth, wall } = useSignupWall();
  const createConversation = useCreateConversation();
  // Share opens the passport sheet (mobile SharePassportModal parity) —
  // the card preview carries the identity, the sheet carries the actions.
  const [shareOpen, setShareOpen] = useState(false);

  const hasCoverMedia = Boolean(user.coverPhoto || user.coverVideo);
  const showMosaic = !hasCoverMedia && closetMosaicCells(closetMedia ?? []).length >= CLOSET_MOSAIC_MIN;
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

  const shareProfile = () => setShareOpen(true);

  return (
    <section aria-label={`@${user.username} profile`}>
      <ProfileCoverBand
        user={user}
        closetMedia={closetMedia}
        listingCount={listingCount}
      />

      <div className="px-4 sm:px-6">
        <ProfileHeroIdentity user={user} hasCoverBand={hasCoverBand}>
          <ProfileStatsStrip
            user={user}
            listingCount={listingCount}
            forSaleCount={forSaleCount}
            soldCount={soldCount}
            onStatPress={onStatPress}
          />

          <ProfileHeroActions
            user={user}
            variant={variant}
            viewer={viewer}
            isMessagingPending={createConversation.isPending}
            onMessageUser={() => void messageUser()}
            onShareProfile={shareProfile}
          />
        </ProfileHeroIdentity>
      </div>

      {wall}

      <SharePassportSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        user={user}
        soldCount={soldCount}
      />
    </section>
  );
}
