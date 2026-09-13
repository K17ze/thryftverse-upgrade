/**
 * useLiveSellerActions — seller-facing viewer actions for the live stream
 * top chrome.
 *
 * Owns:
 * - Follow / unfollow — wired to the real profile social API. Rendered only
 *   when the contract supplies a seller identity.
 * - Share sheet with the seller's name in the message.
 */

import { useCallback, useState } from 'react';
import { Share } from 'react-native';
import { useHaptic } from '../useHaptic';
import { useSignupWall } from '../useSignupWall';
import { useToast } from '../../context/ToastContext';
import { useFollowMutation } from '../../platform/server';
import { useAppTranslation } from '../../i18n/useAppTranslation';

interface UseLiveSellerActionsOptions {
  sellerId: string | undefined;
  sellerName: string | undefined;
}

export function useLiveSellerActions({ sellerId, sellerName }: UseLiveSellerActionsOptions) {
  const haptic = useHaptic();
  const { show } = useToast();
  const { requireAuth } = useSignupWall();
  const { t } = useAppTranslation('liveStreamViewer');

  const [isFollowing, setIsFollowing] = useState(false);
  const followMutation = useFollowMutation(sellerId ?? '');

  const handleShare = useCallback(async () => {
    haptic.light();
    try {
      await Share.share({
        message: t('share.message', { sellerName: sellerName ?? t('share.defaultSeller') }) });
    } catch {
      // User cancelled the share sheet — no error toast needed.
    }
  }, [haptic, sellerName, t]);

  const handleFollowToggle = useCallback(() => {
    haptic.light();
    if (!requireAuth('follow_seller')) return;
    if (!sellerId) return;
    followMutation.mutate(!isFollowing, {
      onSuccess: () => {
        setIsFollowing((prev) => !prev);
        show(isFollowing ? t('toast.unfollowed') : t('toast.following'), 'success');
      },
      onError: () => {
        show(t('toast.followError'), 'error');
      } });
  }, [haptic, followMutation, isFollowing, show, sellerId, requireAuth, t]);

  return {
    isFollowing,
    followPending: followMutation.isPending,
    handleShare,
    handleFollowToggle };
}
