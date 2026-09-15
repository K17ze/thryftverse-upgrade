/**
 * useEditGroupForm — the edit-group form state and save flow: name/
 * description fields, the dirty check against the conversation snapshot,
 * the idempotent save with optimistic store write + server reconcile +
 * rollback, and the "check result" recovery for saves whose outcome was
 * unknown (network drop mid-flight). Extracted verbatim from
 * EditGroupScreen; no behavior change.
 */

import { useCallback, useState } from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { useHaptic } from '../useHaptic';
import {
  fetchConversationFromApi,
  updateConversationOnApi,
} from '../../services/chatApi';
import { classifyNetworkError, parseApiError } from '../../lib/apiClient';
import { createStableId } from '../../utils/createStableId';
import { sanitizeMemberRoles } from '../../components/groupchatinfo/groupChatInfoViewModels';
import type { Conversation } from '../../domain/conversation';
import type { RootStackParamList } from '../../navigation/types';
import type { EditGroupMedia } from './useEditGroupMedia';
import type { EditGroupSaveStatus } from './useEditGroupSaveStatus';

export function useEditGroupForm({
  conversation,
  conversationId,
  media,
  saveStatus,
  navigation,
}: {
  conversation: Conversation | undefined;
  conversationId: string;
  media: EditGroupMedia;
  saveStatus: EditGroupSaveStatus;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}) {
  const { show } = useToast();
  const haptic = useHaptic();
  const upsertConversation = useStore((state) => state.upsertConversation);

  const {
    pendingSaveKeyRef,
    saveIssue,
    setSaveIssue,
    outcomeUnknown,
    setOutcomeUnknown,
    clearPendingSave,
  } = saveStatus;

  const {
    avatar,
    avatarFinalizationId,
    coverPhoto,
    coverPhotoFinalizationId,
    avatarDisplayUri,
    coverDisplayUri,
    avatarUploadStatus,
    coverUploadStatus,
    isUploadingPhoto,
    isUploadingCover,
  } = media;

  const [name, setName] = useState(conversation?.title ?? '');
  const [description, setDescription] = useState(conversation?.description ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingResult, setIsCheckingResult] = useState(false);

  const initialAvatar = conversation?.avatar ?? null;
  const initialCoverPhoto = conversation?.coverPhoto ?? null;
  const hasChanges =
    name.trim() !== (conversation?.title ?? '').trim() ||
    description.trim() !== (conversation?.description ?? '').trim() ||
    avatar !== initialAvatar ||
    coverPhoto !== initialCoverPhoto;

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      clearPendingSave();
    },
    [clearPendingSave]
  );

  const handleDescriptionChange = useCallback(
    (value: string) => {
      setDescription(value);
      clearPendingSave();
    },
    [clearPendingSave]
  );

  const handleSave = useCallback(async () => {
    if (!conversation) return;
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setSaveIssue('Use at least 2 characters for the group name.');
      return;
    }
    if (!hasChanges || isSaving || isUploadingPhoto || isUploadingCover) return;

    const avatarChanged = avatar !== initialAvatar;
    const coverChanged = coverPhoto !== initialCoverPhoto;
    if (avatarChanged && avatar && avatarUploadStatus === 'uploading' && !avatarFinalizationId) {
      setSaveIssue('The group photo is not ready. Choose it again to retry the upload.');
      return;
    }
    if (coverChanged && coverPhoto && coverUploadStatus === 'uploading' && !coverPhotoFinalizationId) {
      setSaveIssue('The cover photo is not ready. Choose it again to retry the upload.');
      return;
    }

    setIsSaving(true);
    setSaveIssue(null);
    const idempotencyKey = pendingSaveKeyRef.current ?? createStableId('group-edit');
    pendingSaveKeyRef.current = idempotencyKey;

    // Optimistic store update — write the local preview URIs to the store
    // immediately so GroupChatInfoScreen reflects the change the instant we
    // navigate back, even before the API round-trip completes. The server
    // response below reconciles the final canonical URLs.
    const optimisticAvatar = avatarDisplayUri ?? avatar;
    const optimisticCover = coverDisplayUri ?? coverPhoto;
    const previousConversation = conversation;
    upsertConversation({
      ...conversation,
      title: trimmedName,
      description: description.trim() || undefined,
      avatar: optimisticAvatar ?? undefined,
      coverPhoto: optimisticCover ?? undefined,
    });

    try {
      const updates: {
        title?: string;
        description?: string;
        avatar?: string | null;
        avatarFinalizationId?: string;
        coverPhoto?: string | null;
        coverPhotoFinalizationId?: string;
      } = {};
      if (trimmedName !== (conversation.title ?? '').trim()) updates.title = trimmedName;
      if (description.trim() !== (conversation.description ?? '').trim()) {
        updates.description = description.trim() || undefined;
      }
      if (avatarChanged) {
        updates.avatar = avatar;
        if (avatarFinalizationId) updates.avatarFinalizationId = avatarFinalizationId;
      }
      if (coverChanged) {
        updates.coverPhoto = coverPhoto;
        if (coverPhotoFinalizationId) updates.coverPhotoFinalizationId = coverPhotoFinalizationId;
      }
      const updated = await updateConversationOnApi(conversationId, updates, idempotencyKey);
      // Reconcile with server-confirmed canonical URLs. Append a cache-buster
      // so expo-image fetches the new image rather than serving a stale
      // memory-disk cache entry from the previous URL.
      upsertConversation({
        ...conversation,
        title: updated.title,
        description: updated.description ?? undefined,
        avatar: updated.avatar
          ? `${updated.avatar}${updated.avatar.includes('?') ? '&' : '?'}t=${Date.now()}`
          : undefined,
        coverPhoto: updated.coverPhoto
          ? `${updated.coverPhoto}${updated.coverPhoto.includes('?') ? '&' : '?'}t=${Date.now()}`
          : undefined,
      });
      pendingSaveKeyRef.current = null;
      haptic.success();
      show('Group details updated.', 'success');
      navigation.goBack();
    } catch (error) {
      const parsed = parseApiError(error, 'Could not update the group.');
      const networkType = classifyNetworkError(error);
      if (parsed.isNetworkError || networkType === 'network' || networkType === 'timeout') {
        setSaveIssue(
          'We could not confirm whether the update finished. Check the group, or tap Save again safely.'
        );
        setOutcomeUnknown(true);
      } else {
        pendingSaveKeyRef.current = null;
        upsertConversation(previousConversation);
        setSaveIssue(parsed.message);
        setOutcomeUnknown(false);
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    conversation,
    name,
    description,
    hasChanges,
    isSaving,
    isUploadingPhoto,
    isUploadingCover,
    avatar,
    avatarFinalizationId,
    coverPhoto,
    coverPhotoFinalizationId,
    avatarDisplayUri,
    coverDisplayUri,
    avatarUploadStatus,
    coverUploadStatus,
    initialAvatar,
    initialCoverPhoto,
    conversationId,
    pendingSaveKeyRef,
    setSaveIssue,
    setOutcomeUnknown,
    upsertConversation,
    haptic,
    show,
    navigation,
  ]);

  const handleCheckResult = useCallback(async () => {
    if (!conversation || isCheckingResult) return;
    setIsCheckingResult(true);
    try {
      const serverConversation = await fetchConversationFromApi(conversationId);
      const serverTitle = serverConversation.title ?? 'Group chat';
      const serverDescription = serverConversation.description ?? '';
      const serverAvatar = serverConversation.avatar ?? null;
      const serverCoverPhoto = serverConversation.coverPhoto ?? null;
      upsertConversation({
        ...conversation,
        title: serverTitle,
        description: serverDescription || undefined,
        avatar: serverAvatar
          ? `${serverAvatar}${serverAvatar.includes('?') ? '&' : '?'}t=${Date.now()}`
          : undefined,
        coverPhoto: serverCoverPhoto
          ? `${serverCoverPhoto}${serverCoverPhoto.includes('?') ? '&' : '?'}t=${Date.now()}`
          : undefined,
        ownerId: serverConversation.ownerId,
        participantIds: serverConversation.participantIds,
        memberRoles: sanitizeMemberRoles(serverConversation.memberRoles),
      });

      const requestedStateLanded =
        serverTitle.trim() === name.trim() &&
        serverDescription.trim() === description.trim() &&
        serverAvatar === avatar &&
        serverCoverPhoto === coverPhoto;
      if (requestedStateLanded) {
        pendingSaveKeyRef.current = null;
        setOutcomeUnknown(false);
        haptic.success();
        show('The group update was completed.', 'success');
        navigation.goBack();
      } else {
        setOutcomeUnknown(false);
        setSaveIssue('The update was not applied. Your edits are still here; tap Save to try again.');
      }
    } catch (error) {
      setSaveIssue(parseApiError(error, 'Could not check the group yet.').message);
    } finally {
      setIsCheckingResult(false);
    }
  }, [
    conversation,
    isCheckingResult,
    conversationId,
    upsertConversation,
    name,
    description,
    avatar,
    coverPhoto,
    pendingSaveKeyRef,
    setOutcomeUnknown,
    setSaveIssue,
    haptic,
    show,
    navigation,
  ]);

  return {
    name,
    description,
    handleNameChange,
    handleDescriptionChange,
    hasChanges,
    isSaving,
    isCheckingResult,
    saveIssue,
    outcomeUnknown,
    handleSave,
    handleCheckResult,
  };
}
