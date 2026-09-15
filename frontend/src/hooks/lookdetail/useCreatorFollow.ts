import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import type { LookApiItem } from '../../services/looksApi';
import type { PublicProfileAggregate } from '../../services/profileApi';
import { usePublicProfileQuery } from '../../platform/server/usePublicProfileQuery';
import { useFollowMutation } from '../../platform/server/useProfileSocialQueries';
import { useHaptic } from '../useHaptic';
import { useToast } from '../../context/ToastContext';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface UseCreatorFollowResult {
  /** The creator's public profile aggregate — fetched so the Follow button
   *  reflects server truth (display name, follower count, viewer relation). */
  creatorProfile: PublicProfileAggregate | null;
  isFollowing: boolean;
  followBusy: boolean;
  handleFollow: () => Promise<void>;
}

/**
 * Owns the creator-relationship domain: the public-profile aggregate fetch
 * (follow state + provenance) and the optimistic follow/unfollow toggle.
 *
 * Uses the shared React Query profile cache and the canonical
 * useFollowMutation so follow state stays consistent across look detail,
 * profiles, connection lists and the following feed.
 */
export function useCreatorFollow(
  look: LookApiItem | null,
  currentUserId: string | undefined,
): UseCreatorFollowResult {
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();

  const creatorId = look?.creator?.id;
  const profileQuery = usePublicProfileQuery(creatorId);
  const followMutation = useFollowMutation(creatorId ?? '');

  const creatorProfile = profileQuery.aggregate ?? null;
  const isFollowing = creatorProfile?.viewer?.isFollowing ?? false;
  const followBusy = followMutation.isPending;

  const handleFollow = useCallback(async () => {
    if (!creatorId) return;
    if (!currentUserId) {
      show('Sign in to follow creators', 'info');
      navigation.navigate('Login');
      return;
    }
    if (followBusy) return;
    haptic.light();
    try {
      await followMutation.mutateAsync(!isFollowing);
    } catch {
      show('Unable to update follow status', 'error');
    }
  }, [creatorId, currentUserId, followBusy, isFollowing, haptic, show, navigation, followMutation]);

  return { creatorProfile, isFollowing, followBusy, handleFollow };
}
