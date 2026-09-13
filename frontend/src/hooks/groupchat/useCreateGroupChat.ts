/**
 * useCreateGroupChat — domain hook for the create-group flow. Composes
 * member search, member selection and group media, and owns the draft
 * fields (stage, title, description), the create submit flow with
 * idempotency key + error mapping, and the recents/suggested/mosaic
 * derivations. Extracted verbatim from CreateGroupChatScreen.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { useHaptic } from '../useHaptic';
import { createGroupConversationOnApi } from '../../services/chatApi';
import { parseApiError } from '../../lib/apiClient';
import { createStableId } from '../../utils/createStableId';
import { MIN_MEMBERS } from '../../utils/chatGroupHelpers';
import type { SelectableUser, Stage } from '../../utils/chatGroupHelpers';
import type { RootStackParamList } from '../../navigation/types';
import type { MosaicMember } from '../../components/chat/GroupAvatarMosaic';
import { useGroupMemberSearch } from './useGroupMemberSearch';
import { useGroupMemberSelection } from './useGroupMemberSelection';
import { useGroupCreateMedia } from './useGroupCreateMedia';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateGroupChat'>;

export function useCreateGroupChat({ navigation, route }: Props) {
  const currentUser = useStore((state) => state.currentUser);
  const conversations = useStore((state) => state.conversations);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const isBlockedUser = useStore((state) => state.isBlockedUser);
  const { show } = useToast();
  const haptic = useHaptic();

  const { prefillMemberIds, prefillTitle } = route?.params ?? {};

  const [stage, setStage] = useState<Stage>('select');
  const [title, setTitle] = useState(prefillTitle ?? '');
  const [description, setDescription] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const clearCreateError = useCallback(() => setCreateError(''), []);

  const search = useGroupMemberSearch(currentUser?.id);
  const selection = useGroupMemberSelection({
    prefillMemberIds,
    currentUserId: currentUser?.id,
    clearCreateError,
  });
  const media = useGroupCreateMedia();

  const idempotencyKeyRef = useRef<string>(createStableId('group'));
  const createAttemptRef = useRef(false);

  const filteredResults = useMemo(() => {
    return search.searchResults.filter((user) => !isBlockedUser(user.id));
  }, [search.searchResults, isBlockedUser]);

  // ── Recents: users from existing conversations (DMs + groups), deduped,
  //    excluding self and blocked users. Ordered by most recent conversation. ──
  const recentUsers = useMemo(() => {
    const seen = new Set<string>();
    const result: SelectableUser[] = [];
    for (const conv of conversations) {
      const profiles = conv.participantProfiles ?? [];
      for (const p of profiles) {
        if (p.id === currentUser?.id) continue;
        if (seen.has(p.id)) continue;
        if (isBlockedUser(p.id)) continue;
        seen.add(p.id);
        result.push({
          id: p.id,
          username: p.username,
          displayName: p.displayName ?? null,
          avatar: p.avatar ?? null });
      }
      // Also include participantIds without profiles (less ideal but still useful)
      for (const pid of conv.participantIds ?? []) {
        if (pid === currentUser?.id) continue;
        if (seen.has(pid)) continue;
        if (isBlockedUser(pid)) continue;
        seen.add(pid);
        result.push({
          id: pid,
          username: pid,
          displayName: null,
          avatar: null });
      }
    }
    return result.slice(0, 12);
  }, [conversations, currentUser?.id, isBlockedUser]);

  // ── Suggested: followed users or sellers with recent activity. Since the
  //    store doesn't track follows, we derive from listing sellers in the
  //    user's conversations and recent item activity. Falls back to recents. ──
  const suggestedUsers = useMemo(() => {
    const recentIds = new Set(recentUsers.map((u) => u.id));
    const seen = new Set(recentIds);
    const result: SelectableUser[] = [];
    // Suggested = sellers from recent conversations (sellerId field)
    for (const conv of conversations) {
      const sellerId = conv.sellerId;
      if (!sellerId || sellerId === currentUser?.id) continue;
      if (seen.has(sellerId)) continue;
      if (isBlockedUser(sellerId)) continue;
      const profile = conv.participantProfiles?.find((p) => p.id === sellerId);
      seen.add(sellerId);
      result.push({
        id: sellerId,
        username: profile?.username ?? sellerId,
        displayName: profile?.displayName ?? null,
        avatar: profile?.avatar ?? null });
    }
    return result.slice(0, 8);
  }, [conversations, currentUser?.id, isBlockedUser, recentUsers]);

  const showRecents = !search.searchQuery.trim() && (recentUsers.length > 0 || suggestedUsers.length > 0);

  // Mosaic members from selected users (for live preview in details stage).
  const mosaicMembers = useMemo<MosaicMember[]>(() => {
    return selection.selectedIds
      .map((id) => selection.selectedUsers.get(id))
      .filter((u): u is SelectableUser => !!u)
      .slice(0, 4)
      .map((u) => ({
        id: u.id,
        displayName: u.displayName ?? u.username,
        avatar: u.avatar }));
  }, [selection.selectedIds, selection.selectedUsers]);

  const handleChangeTitle = useCallback((t: string) => {
    setTitle(t);
    setCreateError('');
  }, []);

  const handleChangeDescription = useCallback((d: string) => {
    setDescription(d);
    setCreateError('');
  }, []);

  const handleContinueToDetails = () => {
    if (selection.selectedIds.length < MIN_MEMBERS) return;
    haptic.light();
    setStage('details');
  };

  const handleBackToSelect = () => {
    haptic.light();
    setStage('select');
  };

  const handleCreateGroup = async () => {
    const groupTitle = title.trim();
    if (!groupTitle) {
      setCreateError('Add a group name to continue.');
      return;
    }
    if (selection.selectedIds.length < MIN_MEMBERS) {
      setCreateError(`Select at least ${MIN_MEMBERS} member${MIN_MEMBERS === 1 ? '' : 's'}.`);
      return;
    }

    if (createAttemptRef.current) return;
    createAttemptRef.current = true;

    setIsCreating(true);
    setCreateError('');

    try {
      const conversation = await createGroupConversationOnApi({
        title: groupTitle,
        memberIds: selection.selectedIds,
        idempotencyKey: idempotencyKeyRef.current,
        description: description.trim() || undefined,
        avatar: media.presetAvatar?.remoteUrl ?? media.groupMedia.avatar.confirmedRemote ?? undefined,
        avatarFinalizationId:
          media.presetAvatar?.finalizationId ?? media.groupMedia.avatar.finalizationId ?? undefined,
        coverPhoto: media.presetCover?.remoteUrl ?? media.groupMedia.cover.confirmedRemote ?? undefined,
        coverPhotoFinalizationId:
          media.presetCover?.finalizationId ?? media.groupMedia.cover.finalizationId ?? undefined });

      upsertConversation(conversation);
      show('Group chat created.', 'success');
      navigation.replace('Chat', { conversationId: conversation.id });
    } catch (err) {
      setCreateError(parseApiError(err, 'Could not create the group. Check your connection and try again.').message);
    } finally {
      setIsCreating(false);
      createAttemptRef.current = false;
    }
  };

  const handleRetryCreate = () => {
    void handleCreateGroup();
  };

  const handleNewDraft = () => {
    idempotencyKeyRef.current = createStableId('group');
    setCreateError('');
    setTitle('');
    setDescription('');
    selection.resetSelection();
    media.resetMedia();
    setStage('select');
  };

  const handleRetrySearch = () => {
    void search.performSearch(search.searchQuery);
  };

  const handleGoBack = () => {
    navigation.goBack();
  };

  return {
    stage,
    title,
    description,
    createError,
    isCreating,
    idempotencyKey: idempotencyKeyRef.current,
    search,
    selection,
    media,
    filteredResults,
    recentUsers,
    suggestedUsers,
    showRecents,
    mosaicMembers,
    onTitleChange: handleChangeTitle,
    onDescriptionChange: handleChangeDescription,
    onContinueToDetails: handleContinueToDetails,
    onBackToSelect: handleBackToSelect,
    onCreateGroup: () => void handleCreateGroup(),
    onRetryCreate: handleRetryCreate,
    onNewDraft: handleNewDraft,
    onRetrySearch: handleRetrySearch,
    onBack: handleGoBack,
  };
}
