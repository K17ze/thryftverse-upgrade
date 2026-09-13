import { useState, useEffect, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import type { LookApiItem } from '../../services/looksApi';
import {
  fetchPublicProfileAggregate,
  followUser,
  unfollowUser,
  type PublicProfileAggregate } from '../../services/profileApi';
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
 */
export function useCreatorFollow(
  look: LookApiItem | null,
  currentUserId: string | undefined,
): UseCreatorFollowResult {
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();

  // Creator relationship — fetched so the Follow button reflects server truth.
  const [creatorProfile, setCreatorProfile] = useState<PublicProfileAggregate | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  // Fetch the creator's public profile (for follow state + provenance).
  // Runs after the look loads.
  useEffect(() => {
    if (!look?.creator?.id) return;
    const creatorId = look.creator.id;
    let cancelled = false;

    fetchPublicProfileAggregate(creatorId)
      .then((agg) => {
        if (cancelled) return;
        setCreatorProfile(agg);
        setIsFollowing(agg.viewer?.isFollowing ?? false);
      })
      .catch(() => {
        // Profile fetch is non-fatal — the Follow button simply stays in its
        // default resting state.
      });

    return () => {
      cancelled = true;
    };
  }, [look]);

  const handleFollow = useCallback(async () => {
    if (!look?.creator?.id) return;
    if (!currentUserId) {
      show('Sign in to follow creators', 'info');
      navigation.navigate('Login');
      return;
    }
    if (followBusy) return;
    const next = !isFollowing;
    setFollowBusy(true);
    haptic.light();
    // Optimistic update.
    setIsFollowing(next);
    try {
      if (next) {
        await followUser(look.creator.id);
      } else {
        await unfollowUser(look.creator.id);
      }
    } catch {
      // Revert on failure.
      setIsFollowing(!next);
      show('Unable to update follow status', 'error');
    } finally {
      setFollowBusy(false);
    }
  }, [look, currentUserId, followBusy, isFollowing, haptic, show, navigation]);

  return { creatorProfile, isFollowing, followBusy, handleFollow };
}
