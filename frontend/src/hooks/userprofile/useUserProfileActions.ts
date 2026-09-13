import { useCallback, useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  useFollowMutation,
  useBlockMutation,
  useMuteMutation,
  useRestrictMutation,
  useReportUserMutation,
} from '../../platform/server';
import type { PublicProfileViewer, ReportReason } from '../../services/profileApi';
import { useHaptic } from '../useHaptic';
import { useSignupWall } from '../useSignupWall';
import { useToast } from '../../context/ToastContext';
import { RootStackParamList } from '../../navigation/types';
import { openProfile } from '../../navigation/openProfile';
import { respondToReview } from '../../services/reviewApi';
import { track } from '../../analytics';
import { PROFILE_WEB_BASE } from './constants';
import type {
  UserProfileConnectionsSegment,
  UserProfileConnectionsSheetState,
  UserProfileResponseComposerState,
  UserProfileReviewReportState,
} from './types';

// Minimal navigation surface — screens pass route-specific
// NativeStackNavigationProp instances whose setParams signatures are
// incompatible with the unparameterised prop (same variance issue handled
// by openProfile's ProfileNavigation type). Only `navigate` is used.
type UserProfileNavigation = Pick<
  NativeStackNavigationProp<RootStackParamList, keyof RootStackParamList>,
  'navigate'
>;

interface UseUserProfileActionsParams {
  navigation: UserProfileNavigation;
  targetUserId: string | undefined;
  currentUserId: string | undefined;
  viewer: PublicProfileViewer | null;
  displayUsername: string;
  refetchReviews: () => void;
}

/**
 * Owns the user-profile action surface: follow/block/report mutations, the
 * sheet + modal visibility state they drive (more, report, block confirm,
 * connections, response composer, review report, share passport), and every
 * handler wired to the hero, collapsed header, list rows and sheets.
 */
export function useUserProfileActions({
  navigation,
  targetUserId,
  currentUserId,
  viewer,
  displayUsername,
  refetchReviews,
}: UseUserProfileActionsParams) {
  const { show: showToast } = useToast();
  const { requireAuth } = useSignupWall();
  const haptic = useHaptic();

  const [connectionsSheet, setConnectionsSheet] = useState<UserProfileConnectionsSheetState>({ visible: false, segment: 'followers' });
  const [moreSheetVisible, setMoreSheetVisible] = useState(false);
  const [showPassportModal, setShowPassportModal] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [blockConfirmVisible, setBlockConfirmVisible] = useState(false);
  const [restrictConfirmVisible, setRestrictConfirmVisible] = useState(false);
  const [responseComposer, setResponseComposer] = useState<UserProfileResponseComposerState>({ visible: false, reviewId: '' });
  const [reportSheet, setReportSheet] = useState<UserProfileReviewReportState>({ visible: false, reviewId: '' });

  const followMutation = useFollowMutation(targetUserId ?? '');
  const blockMutation = useBlockMutation(targetUserId ?? '');
  const muteMutation = useMuteMutation(targetUserId ?? '');
  const restrictMutation = useRestrictMutation(targetUserId ?? '');
  const reportMutation = useReportUserMutation(targetUserId ?? '');

  const profileDeepLink = useMemo(() => targetUserId ? `${PROFILE_WEB_BASE}/u/${encodeURIComponent(targetUserId)}` : PROFILE_WEB_BASE, [targetUserId]);

  const handleShare = useCallback(() => {
    haptic.light();
    setShowPassportModal(true);
  }, [haptic]);

  const handleCopyLink = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(profileDeepLink);
      setMoreSheetVisible(false);
      showToast('Profile link copied', 'success');
    } catch {
      showToast('Could not copy link', 'error');
    }
  }, [profileDeepLink, showToast]);

  const handleMessageProfile = useCallback(() => {
    haptic.light();
    if (!requireAuth('message_seller')) return;
    if (!targetUserId) return;
    if (viewer && !viewer.canMessage) return;
    navigation.navigate('NewMessage', { preselectedUserId: targetUserId, preselectedDisplayName: displayUsername });
  }, [requireAuth, displayUsername, navigation, targetUserId, viewer, haptic]);

  const handleFollowToggle = useCallback(() => {
    haptic.light();
    if (!requireAuth('follow_seller')) return;
    if (targetUserId && viewer) {
      followMutation.mutate(!viewer.isFollowing);
      track('follow_toggled', { user_id: targetUserId, action: !viewer.isFollowing ? 'follow' : 'unfollow' });
    }
  }, [requireAuth, targetUserId, viewer, followMutation, haptic]);
  const handleMore = useCallback(() => setMoreSheetVisible(true), []);
  const handleReport = useCallback(() => { setMoreSheetVisible(false); setReportSheetVisible(true); }, []);
  const handleBlock = useCallback(() => { setMoreSheetVisible(false); setBlockConfirmVisible(true); }, []);
  const handleRestrict = useCallback(() => { setMoreSheetVisible(false); setRestrictConfirmVisible(true); }, []);

  const handleRespondToReview = useCallback(async (reviewId: string, text: string) => {
    await respondToReview(reviewId, text);
    refetchReviews();
  }, [refetchReviews]);

  const handleCloseResponseComposer = useCallback(() => {
    setResponseComposer((prev) => ({ ...prev, visible: false }));
  }, []);
  const confirmBlock = useCallback(() => {
    setBlockConfirmVisible(false);
    blockMutation.mutate(true, { onSuccess: () => showToast('User blocked', 'success'), onError: () => showToast('Could not block user', 'error') });
  }, [blockMutation, showToast]);
  const handleUnblock = useCallback(() => {
    setMoreSheetVisible(false);
    blockMutation.mutate(false, { onSuccess: () => showToast('User unblocked', 'success'), onError: () => showToast('Could not unblock user', 'error') });
  }, [blockMutation, showToast]);
  // Mute toggles directly — it's silent and reversible, no confirm needed.
  const handleMute = useCallback(() => {
    setMoreSheetVisible(false);
    muteMutation.mutate(true, { onSuccess: () => showToast('User muted', 'success'), onError: () => showToast('Could not mute user', 'error') });
  }, [muteMutation, showToast]);
  const handleUnmute = useCallback(() => {
    setMoreSheetVisible(false);
    muteMutation.mutate(false, { onSuccess: () => showToast('User unmuted', 'success'), onError: () => showToast('Could not unmute user', 'error') });
  }, [muteMutation, showToast]);
  const confirmRestrict = useCallback(() => {
    setRestrictConfirmVisible(false);
    restrictMutation.mutate(true, { onSuccess: () => showToast('User restricted', 'success'), onError: () => showToast('Could not restrict user', 'error') });
  }, [restrictMutation, showToast]);
  const handleUnrestrict = useCallback(() => {
    setMoreSheetVisible(false);
    restrictMutation.mutate(false, { onSuccess: () => showToast('User unrestricted', 'success'), onError: () => showToast('Could not unrestrict user', 'error') });
  }, [restrictMutation, showToast]);
  const openConnections = useCallback((segment: UserProfileConnectionsSegment) => setConnectionsSheet({ visible: true, segment }), []);

  const handleReportSubmit = useCallback((reason: ReportReason, details?: string) => {
    reportMutation.mutate(
      { reason, details },
      {
        onSuccess: () => { setReportSheetVisible(false); showToast('Report submitted', 'success'); },
        onError: () => showToast('Could not submit report', 'error'),
      }
    );
  }, [reportMutation, showToast]);

  const handleOpenProfile = useCallback((userId: string) => {
    openProfile(navigation, userId, currentUserId);
  }, [navigation, currentUserId]);

  const openResponseComposer = useCallback((reviewId: string, reviewerName: string, rating: number) => {
    setResponseComposer({ visible: true, reviewId, reviewerName, rating });
  }, []);
  const openReviewReport = useCallback((reviewId: string) => {
    setReportSheet({ visible: true, reviewId });
  }, []);

  const dismissMoreSheet = useCallback(() => setMoreSheetVisible(false), []);
  const dismissReportSheet = useCallback(() => setReportSheetVisible(false), []);
  const dismissBlockConfirm = useCallback(() => setBlockConfirmVisible(false), []);
  const dismissRestrictConfirm = useCallback(() => setRestrictConfirmVisible(false), []);
  const dismissConnections = useCallback(() => setConnectionsSheet(s => ({ ...s, visible: false })), []);
  const closePassportModal = useCallback(() => setShowPassportModal(false), []);
  const dismissReviewReport = useCallback(() => setReportSheet({ visible: false, reviewId: '' }), []);
  const handleReviewReportSubmitted = useCallback(() => showToast('Report submitted', 'success'), [showToast]);
  const handleReviewReportError = useCallback((message: string) => showToast(message, 'error'), [showToast]);

  return {
    connectionsSheet,
    moreSheetVisible,
    showPassportModal,
    reportSheetVisible,
    blockConfirmVisible,
    restrictConfirmVisible,
    responseComposer,
    reportSheet,
    followPending: followMutation.isPending,
    blockPending: blockMutation.isPending,
    mutePending: muteMutation.isPending,
    restrictPending: restrictMutation.isPending,
    reportPending: reportMutation.isPending,
    handleShare,
    handleCopyLink,
    handleMessageProfile,
    handleFollowToggle,
    handleMore,
    handleReport,
    handleBlock,
    handleRestrict,
    handleMute,
    handleUnmute,
    confirmRestrict,
    handleUnrestrict,
    handleRespondToReview,
    handleCloseResponseComposer,
    confirmBlock,
    handleUnblock,
    openConnections,
    handleReportSubmit,
    handleOpenProfile,
    openResponseComposer,
    openReviewReport,
    dismissMoreSheet,
    dismissReportSheet,
    dismissBlockConfirm,
    dismissRestrictConfirm,
    dismissConnections,
    closePassportModal,
    dismissReviewReport,
    handleReviewReportSubmitted,
    handleReviewReportError,
  };
}
