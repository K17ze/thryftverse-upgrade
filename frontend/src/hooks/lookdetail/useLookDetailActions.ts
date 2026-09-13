import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import { Share } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { deleteLookOnApi, repostLookOnApi, type LookApiItem } from '../../services/looksApi';
import { useHaptic } from '../useHaptic';
import { useToast } from '../../context/ToastContext';
import { useAnalyticsEvent } from '../useAnalyticsEvent';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface ConfirmSheetState {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
}

export interface UseLookDetailActionsOptions {
  look: LookApiItem | null;
  isOwner: boolean;
  currentUserId: string | undefined;
}

export interface UseLookDetailActionsResult {
  overflowVisible: boolean;
  /** Haptic + open the overflow bottom sheet (header "more" button). */
  openOverflow: () => void;
  closeOverflow: () => void;
  confirmSheet: ConfirmSheetState;
  setConfirmSheet: Dispatch<SetStateAction<ConfirmSheetState>>;
  repostBusy: boolean;
  handleShare: () => Promise<void>;
  handleEdit: () => void;
  handleRecreate: () => void;
  handleRepost: () => Promise<void>;
  handleReport: () => void;
  handleDelete: () => void;
  handleCreatorPress: () => void;
}

/**
 * Owns the look action domain: share, edit (owner), recreate/remix, repost
 * with attribution, report, delete-with-confirmation, creator-profile
 * navigation, and the overflow-menu + confirmation-sheet state they drive.
 */
export function useLookDetailActions({
  look,
  isOwner,
  currentUserId,
}: UseLookDetailActionsOptions): UseLookDetailActionsResult {
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();
  const analyticsEvent = useAnalyticsEvent();

  const [overflowVisible, setOverflowVisible] = useState(false);
  const [repostBusy, setRepostBusy] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<ConfirmSheetState>({
    visible: false, title: '', message: '', onConfirm: () => {} });

  const openOverflow = useCallback(() => {
    haptic.light();
    setOverflowVisible(true);
  }, [haptic]);

  const closeOverflow = useCallback(() => setOverflowVisible(false), []);

  const handleShare = useCallback(async () => {
    haptic.light();
    if (look) {
      analyticsEvent.share('look', look.id, { surface: 'look_detail', ownerId: look.creatorId });
    }
    try {
      await Share.share({
        title: 'Thryftverse Look',
        message: look?.caption
          ? `${look.caption}\n\nLook ID: ${look?.id}`
          : `View this Look on Thryftverse.\n\nLook ID: ${look?.id}` });
    } catch {
      // Share failed or was dismissed — no feedback needed unless it's a real error
    }
  }, [haptic, look, analyticsEvent]);

  const handleEdit = useCallback(() => {
    if (!look || !isOwner) return;
    setOverflowVisible(false);
    haptic.light();
    navigation.navigate('CreatorStudio', {
      type: 'look',
      sourceDocumentId: look.id,
      sourceMode: 'edit' });
  }, [look, isOwner, navigation, haptic]);

  // Recreate — open the creator studio seeded from this look so the user can
  // build their own version from this composition. Fashion-native term for
  // the fork/derivative action — "recreate this look" is what stylists and
  // creators say, not "remix" (which reads as video/audio).
  // Available to everyone (not just owner), but requires authentication.
  const handleRecreate = useCallback(() => {
    if (!look) return;
    if (!currentUserId) {
      show('Sign in to recreate looks', 'info');
      navigation.navigate('Login');
      return;
    }
    haptic.light();
    setOverflowVisible(false);
    navigation.navigate('CreatorStudio', {
      type: 'look',
      sourceDocumentId: look.id,
      sourceMode: 'remix' });
  }, [look, currentUserId, navigation, haptic, show]);

  // Repost — lightweight re-publish with attribution to the original creator.
  // Creates a new look owned by the reposter that references the source via
  // source_look_id. The media and tags are copied; attribution is preserved.
  const handleRepost = useCallback(async () => {
    if (!look) return;
    if (!currentUserId) {
      show('Sign in to repost looks', 'info');
      navigation.navigate('Login');
      return;
    }
    if (repostBusy) return;
    if (isOwner) {
      show('You can\'t repost your own look', 'info');
      return;
    }
    haptic.medium();
    setOverflowVisible(false);
    setRepostBusy(true);
    try {
      const res = await repostLookOnApi(look.id);
      if (res.ok) {
        show('Reposted to your profile', 'success');
      }
    } catch {
      show('Unable to repost this look', 'error');
    } finally {
      setRepostBusy(false);
    }
  }, [look, currentUserId, isOwner, repostBusy, haptic, show, navigation]);

  const handleReport = useCallback(() => {
    if (!look?.creator?.id) return;
    haptic.light();
    setOverflowVisible(false);
    navigation.navigate('Report', { type: 'user', targetId: look.creator.id });
  }, [look, navigation, haptic]);

  const handleDelete = useCallback(() => {
    if (!look || !isOwner) return;
    setOverflowVisible(false);
    setConfirmSheet({
      visible: true,
      title: 'Delete look',
      message: 'This look will be permanently removed. This action cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteLookOnApi(look.id);
          show('Look deleted', 'success');
          navigation.goBack();
        } catch {
          show('Unable to delete look', 'error');
        }
      } });
  }, [look, isOwner, show, navigation]);

  const handleCreatorPress = useCallback(() => {
    if (!look?.creator?.id) return;
    haptic.light();
    analyticsEvent.profileVisit('look', look.id, { surface: 'look_detail', ownerId: look.creatorId });
    navigation.navigate('UserProfile', { userId: look.creator.id });
  }, [look, navigation, haptic, analyticsEvent]);

  return {
    overflowVisible,
    openOverflow,
    closeOverflow,
    confirmSheet,
    setConfirmSheet,
    repostBusy,
    handleShare,
    handleEdit,
    handleRecreate,
    handleRepost,
    handleReport,
    handleDelete,
    handleCreatorPress,
  };
}
