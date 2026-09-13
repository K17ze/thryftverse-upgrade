import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import {
  computeProfileCompletion,
  resolveCompletionCtaKey,
  type CompletionCtaResult,
} from '../../components/myprofile/myProfileViewModels';
import type { FollowCountsStatus } from './types';

/**
 * Profile-completion + growth-prompt state for the owner profile.
 *
 * Completion measures ONLY identity fields the user can complete directly:
 * display name, bio, profile photo and cover. Audience growth (followers)
 * and first listing are NOT profile-completion requirements — they are
 * growth tasks surfaced separately so a user is never told their profile is
 * "incomplete" because nobody has followed them or they haven't listed yet.
 *
 * Extracted from MyProfileScreen — derivation inputs, dismiss/re-show
 * semantics and prompt gating are verbatim.
 */
export function useMyProfileCompletion(input: {
  displayName: string | null | undefined;
  bio: string | null | undefined;
  hasAvatar: boolean;
  hasCover: boolean;
  listingCount: number;
  followCountsStatus: FollowCountsStatus;
  followerCount: number;
}) {
  const { t: tt } = useAppTranslation('myProfile');
  const { displayName, bio, hasAvatar, hasCover, listingCount, followCountsStatus, followerCount } = input;

  const completion = useMemo(
    () => computeProfileCompletion({ displayName, bio, hasAvatar, hasCover }),
    [displayName, bio, hasAvatar, hasCover],
  );

  // Once every direct identity field is filled the profile is "sufficiently
  // complete" and the completion card is permanently removed from the ordinary
  // profile view (it does not reappear on later visits).
  const profileSufficientlyComplete = completion.percent >= 100;

  // First missing identity facet → the CTA label + EditProfile focus. Every
  // completion CTA routes to EditProfile because every remaining gap is a
  // direct profile field. Listing/audience growth CTAs live in the separate
  // growth-tasks section below the identity hero.
  const completionCta = useMemo<CompletionCtaResult>(() => {
    const { labelKey, focus } = resolveCompletionCtaKey({ displayName, bio, hasAvatar, hasCover });
    return { label: tt(labelKey), focus };
  }, [displayName, bio, hasAvatar, hasCover, tt]);

  const [completionDismissed, setCompletionDismissed] = useState(false);
  // Re-show the prompt when completion improves so progress is celebrated once.
  const prevPercentRef = useRef(completion.percent);
  useEffect(() => {
    if (completion.percent > prevPercentRef.current) {
      setCompletionDismissed(false);
    }
    prevPercentRef.current = completion.percent;
  }, [completion.percent]);
  const showCompletionPrompt =
    !profileSufficientlyComplete && !completionDismissed && completion.percent < 100;

  // Growth tasks — first listing and audience growth are surfaced outside the
  // identity hero as optional onboarding prompts. They are NOT profile-
  // completion requirements. Each CTA routes to a truthful destination:
  // "List your first item" → Sell, "Grow your audience" → creator analytics.
  const showFirstListingGrowth = listingCount === 0;
  const showAudienceGrowth = followCountsStatus === 'loaded' && followerCount === 0;
  const [growthDismissed, setGrowthDismissed] = useState(false);
  const showGrowthPrompt = !growthDismissed && (showFirstListingGrowth || showAudienceGrowth);

  return {
    completion,
    completionCta,
    showCompletionPrompt,
    showGrowthPrompt,
    showFirstListingGrowth,
    showAudienceGrowth,
    dismissCompletion: () => setCompletionDismissed(true),
    dismissGrowth: () => setGrowthDismissed(true),
  };
}
