import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { CachedImage } from '../components/CachedImage';
import { GroupAvatarMosaic } from '../components/chat/GroupAvatarMosaic';
import { GroupMediaSourceSheet, type GroupMediaSource } from '../components/chat/GroupMediaSourceSheet';
import { createGroupConversationOnApi } from '../services/chatApi';
import { searchUsers, UserSearchResult } from '../services/profileApi';
import { parseApiError } from '../lib/apiClient';
import { createStableId } from '../utils/createStableId';
import { useGroupMediaUpload } from '../hooks/useGroupMediaUpload';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AppInput } from '../components/ui/AppInput';
import { AppButton } from '../components/ui/AppButton';
import { Space, Radius, TypeStyles, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { Meta, Caption, BodyEmphasis } from '../components/ui/Text';
import { useHaptic } from '../hooks/useHaptic';
import { KeyboardAwareStickyAction } from '../platform/keyboard';
import {
  MAX_MEMBERS,
  MIN_MEMBERS,
  SEARCH_DEBOUNCE_MS,
  canContinueToDetails,
  canCreateGroup,
  filterBlockedUsers,
  filterSelfFromResults,
  isSearchQueryValid,
  toggleMemberId,
  validateGroupTitle } from '../utils/chatGroupHelpers';
import type { SelectableUser as HelperSelectableUser, Stage } from '../utils/chatGroupHelpers';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateGroupChat'>;

interface SelectableUser extends UserSearchResult {
  displayName: string | null;
  avatar: string | null;
}

export default function CreateGroupChatScreen({ navigation }: Props) {
  const currentUser = useStore((state) => state.currentUser);
  const conversations = useStore((state) => state.conversations);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const isBlockedUser = useStore((state) => state.isBlockedUser);
  const { show } = useToast();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [stage, setStage] = useState<Stage>('select');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Map<string, SelectableUser>>(new Map());
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [createError, setCreateError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState<SelectableUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [mediaSourceSheet, setMediaSourceSheet] = useState<{ visible: boolean; target: 'avatar' | 'cover' }>({ visible: false, target: 'avatar' });
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flagship media upload — optimistic preview, client-side compression,
  // camera+gallery source, retry/revert, stale-operation guard.
  const groupMedia = useGroupMediaUpload(null, null);
  const isUploadingPhoto = groupMedia.avatar.status === 'uploading';
  const isUploadingCover = groupMedia.cover.status === 'uploading';

  const idempotencyKeyRef = useRef<string>(createStableId('group'));
  const createAttemptRef = useRef(false);

  const filteredResults = useMemo(() => {
    return searchResults.filter((user) => !isBlockedUser(user.id));
  }, [searchResults, isBlockedUser]);

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

  const showRecents = !searchQuery.trim() && (recentUsers.length > 0 || suggestedUsers.length > 0);

  // Mosaic members from selected users (for live preview in details stage).
  const mosaicMembers = useMemo(() => {
    return selectedIds
      .map((id) => selectedUsers.get(id))
      .filter((u): u is SelectableUser => !!u)
      .slice(0, 4)
      .map((u) => ({
        id: u.id,
        displayName: u.displayName ?? u.username,
        avatar: u.avatar }));
  }, [selectedIds, selectedUsers]);

  const handlePickGroupPhoto = useCallback(() => {
    if (isUploadingPhoto) return;
    haptic.light();
    setMediaSourceSheet({ visible: true, target: 'avatar' });
  }, [haptic, isUploadingPhoto]);

  const handlePickCoverPhoto = useCallback(() => {
    if (isUploadingCover) return;
    haptic.light();
    setMediaSourceSheet({ visible: true, target: 'cover' });
  }, [haptic, isUploadingCover]);

  const handleMediaSourceSelect = useCallback((source: GroupMediaSource) => {
    const target = mediaSourceSheet.target;
    if (target === 'avatar') {
      void groupMedia.pickAvatar(source);
    } else {
      void groupMedia.pickCover(source);
    }
  }, [mediaSourceSheet.target, groupMedia]);

  const handleRemoveGroupPhoto = useCallback(() => {
    haptic.light();
    groupMedia.removeAvatar();
  }, [haptic, groupMedia]);

  const handleRemoveCoverPhoto = useCallback(() => {
    haptic.light();
    groupMedia.removeCover();
  }, [haptic, groupMedia]);

  const toggleMember = (user: SelectableUser) => {
    haptic.light();
    setCreateError('');
    setSelectedIds((current) => {
      if (current.includes(user.id)) {
        setSelectedUsers((prev) => {
          const next = new Map(prev);
          next.delete(user.id);
          return next;
        });
        return current.filter((id) => id !== user.id);
      }
      if (current.length >= MAX_MEMBERS) {
        show(`Groups are limited to ${MAX_MEMBERS} members`, 'error');
        return current;
      }
      setSelectedUsers((prev) => {
        const next = new Map(prev);
        next.set(user.id, user);
        return next;
      });
      return [...current, user.id];
    });
  };

  const performSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      setSearchError('');
      return;
    }
    setIsSearching(true);
    setHasSearched(false);
    setSearchError('');
    try {
      const results = await searchUsers(trimmed, 20);
      const filtered = results
        .filter((r) => r.id !== currentUser?.id)
        .map((r) => ({ ...r, displayName: r.displayName, avatar: r.avatar }));
      setSearchResults(filtered);
      setHasSearched(true);
    } catch (err) {
      setSearchResults([]);
      setHasSearched(true);
      setSearchError(parseApiError(err, 'Search failed. Check your connection.').message);
    } finally {
      setIsSearching(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      setIsSearching(false);
      setSearchError('');
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      void performSearch(searchQuery);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, performSearch]);

  const handleContinueToDetails = () => {
    if (selectedIds.length < MIN_MEMBERS) return;
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
    if (selectedIds.length < MIN_MEMBERS) {
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
        memberIds: selectedIds,
        idempotencyKey: idempotencyKeyRef.current,
        description: description.trim() || undefined,
        avatar: groupMedia.avatar.confirmedRemote ?? undefined,
        avatarFinalizationId: groupMedia.avatar.finalizationId ?? undefined,
        coverPhoto: groupMedia.cover.confirmedRemote ?? undefined,
        coverPhotoFinalizationId: groupMedia.cover.finalizationId ?? undefined });

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
    setSelectedIds([]);
    setSelectedUsers(new Map());
    groupMedia.removeAvatar();
    groupMedia.removeCover();
    setStage('select');
  };

  const renderMemberRow = ({ item }: { item: SelectableUser }) => {
    const selected = selectedIds.includes(item.id);
    const displayName = item.displayName ?? item.username;
    return (
      <Pressable
        onPress={() => toggleMember(item)}
        style={({ pressed }) => [
          styles.memberRow,
          pressed && styles.memberRowPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${item.displayName ?? '@' + item.username}`}
        accessibilityHint="Toggles this member for the new group"
        accessibilityState={{ selected }}
      >
        {item.avatar ? (
          <CachedImage uri={item.avatar} style={styles.memberAvatar} contentFit="cover" />
        ) : (
          <View style={styles.memberAvatarPlaceholder}>
            <Text style={styles.memberAvatarText}>{displayName[0]?.toUpperCase() ?? '?'}</Text>
          </View>
        )}

        <View style={styles.memberTextWrap}>
          <Text style={styles.memberDisplayName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.memberUsername} numberOfLines={1}>@{item.username}</Text>
        </View>

        <View style={[styles.checkCircle, selected && styles.checkCircleActive]}>
          {selected ? (
            <Ionicons name="checkmark" size={18} color={colors.textInverse} />
          ) : (
            <Ionicons name="ellipse-outline" size={22} color={colors.textMuted} />
          )}
        </View>
      </Pressable>
    );
  };

  if (stage === 'details') {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Group Details" onBack={handleBackToSelect} />} scrollEnabled={false}>
        <KeyboardAwareStickyAction
          style={styles.detailsRoot}
          contentContainerStyle={styles.detailsContent}
          keyboardShouldPersistTaps="always"
          stickyAction={
            <>
              {createError ? (
                <View style={styles.createErrorBanner}>
                  <Ionicons name="alert-circle" size={16} color={colors.danger} />
                  <Text style={styles.createErrorText}>{createError}</Text>
                  <Pressable
                    onPress={handleRetryCreate}
                    hitSlop={8}
                    style={({ pressed }) => pressed && { opacity: 0.5 }}
                    accessibilityRole="button"
                    accessibilityLabel="Retry creating group"
                  >
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                </View>
              ) : null}
              <View style={[styles.stickyAction, { paddingBottom: Math.max(insets.bottom, Space.sm) + 8 }]}>
                <AppButton
                  style={[styles.createBtn, (!title.trim() || isCreating || isUploadingPhoto || isUploadingCover) && styles.createBtnDisabled]}
                  variant="primary"
                  size="md"
                  align="center"
                  title={isCreating ? 'Creating...' : (isUploadingPhoto || isUploadingCover) ? 'Uploading photo...' : 'Create Group'}
                  onPress={() => void handleCreateGroup()}
                  disabled={!title.trim() || isCreating || isUploadingPhoto || isUploadingCover}
                  accessibilityLabel={isCreating ? 'Creating group chat' : 'Create group chat'}
                  accessibilityRole="button"
                />
              </View>
            </>
          }
        >
          {/* Cover photo — wide banner, optional. Separate from the circular
              group avatar. Matches WhatsApp/Telegram group creation pattern. */}
          <Pressable
            onPress={handlePickCoverPhoto}
            disabled={isUploadingCover}
            style={({ pressed }) => [
              styles.coverSelector,
              pressed && styles.avatarSelectorPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={groupMedia.coverDisplayUri ? 'Change cover photo' : 'Add cover photo'}
            accessibilityHint="Choose a wide cover image from camera or gallery"
          >
            {groupMedia.coverDisplayUri ? (
              <CachedImage
                uri={groupMedia.coverDisplayUri}
                style={styles.coverImage}
                contentFit="cover"
                priority="high"
              />
            ) : (
              <View style={[styles.coverPlaceholder, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="image-outline" size={24} color={colors.textMuted} />
                <Text style={[styles.coverPlaceholderText, { color: colors.textMuted }]}>
                  {isUploadingCover ? 'Uploading…' : 'Add cover photo'}
                </Text>
              </View>
            )}
            {isUploadingCover ? (
              <View style={styles.coverUploadingOverlay}>
                <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
              </View>
            ) : null}
            {groupMedia.coverDisplayUri && !isUploadingCover ? (
              <Pressable
                style={styles.coverRemoveBtn}
                onPress={handleRemoveCoverPhoto}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Remove cover photo"
              >
                <Ionicons name="close-circle" size={22} color={colors.scrimTextPrimary} />
              </Pressable>
            ) : null}
          </Pressable>

          <View style={styles.avatarSelectorWrap}>
            <Pressable
              onPress={handlePickGroupPhoto}
              disabled={isUploadingPhoto}
              style={({ pressed }) => [
                styles.avatarSelectorPressable,
                pressed && styles.avatarSelectorPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Set group photo"
              accessibilityHint="Choose a group photo from camera or gallery"
            >
              <GroupAvatarMosaic
                members={mosaicMembers}
                groupPhoto={groupMedia.avatarDisplayUri}
                fallbackInitials={title.trim() || 'G'}
                groupId={idempotencyKeyRef.current}
                size={Space.xxl + Space.xl}
              />
              {isUploadingPhoto ? (
                <View style={styles.avatarUploadingOverlay}>
                  <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
                </View>
              ) : (
                <View style={styles.cameraBadge}>
                  <Ionicons name="camera" size={14} color={colors.textInverse} />
                </View>
              )}
            </Pressable>
            <Caption color={colors.textMuted} style={styles.avatarHint}>
              {isUploadingPhoto
                ? 'Uploading photo...'
                : groupMedia.avatarDisplayUri
                  ? 'Tap to change photo'
                  : 'Tap to add photo · mosaic auto-generated'}
            </Caption>
            {groupMedia.avatarDisplayUri && !isUploadingPhoto ? (
              <Pressable
                onPress={handleRemoveGroupPhoto}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Remove group photo"
              >
                <Caption color={colors.danger} style={styles.removeText}>Remove photo</Caption>
              </Pressable>
            ) : null}
            {groupMedia.avatar.status === 'failed' ? (
              <View style={styles.mediaErrorRow}>
                <Ionicons name="warning-outline" size={13} color={colors.danger} />
                <Text style={[styles.mediaErrorText, { color: colors.danger }]} numberOfLines={2}>
                  {groupMedia.avatar.error}
                </Text>
                <Pressable onPress={() => void groupMedia.retryAvatar()} hitSlop={8}>
                  <Text style={[styles.retryText, { color: colors.brand }]}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Group name</Text>
            <AppInput
              value={title}
              onChangeText={(t) => { setTitle(t); setCreateError(''); }}
              placeholder="Group name"
              placeholderTextColor={colors.textMuted}
              maxLength={80}
              inputContainerStyle={styles.fieldInputWrap}
              inputStyle={styles.fieldInput}
              accessibilityLabel="Group name input"
              accessibilityHint="Enter a name for the new group chat"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Description (optional)</Text>
            <AppInput
              value={description}
              onChangeText={(t) => { setDescription(t); setCreateError(''); }}
              placeholder="What's this group about?"
              placeholderTextColor={colors.textMuted}
              maxLength={280}
              multiline
              inputContainerStyle={styles.fieldInputWrapMultiline}
              inputStyle={styles.fieldInputMultiline}
              accessibilityLabel="Group description input"
              accessibilityHint="Enter an optional description for the group"
            />
            <Text style={styles.charCount}>{description.length}/280</Text>
          </View>

          <View style={styles.participantSection}>
            <View style={styles.participantHeader}>
              <Text style={styles.fieldLabel}>{selectedIds.length} member{selectedIds.length === 1 ? '' : 's'}</Text>
            </View>
            {selectedIds.map((id) => {
              const user = selectedUsers.get(id);
              const displayName = user?.displayName ?? user?.username ?? 'User';
              return (
                <View key={id} style={styles.participantRow}>
                  {user?.avatar ? (
                    <CachedImage uri={user.avatar} style={styles.participantAvatar} contentFit="cover" />
                  ) : (
                    <View style={styles.participantAvatarPlaceholder}>
                      <Text style={styles.participantAvatarText}>{displayName[0]?.toUpperCase() ?? '?'}</Text>
                    </View>
                  )}
                  <View style={styles.participantTextWrap}>
                    <Text style={styles.participantName} numberOfLines={1}>{displayName}</Text>
                    <Text style={styles.participantHandle} numberOfLines={1}>@{user?.username}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </KeyboardAwareStickyAction>
        <GroupMediaSourceSheet
          visible={mediaSourceSheet.visible}
          onClose={() => setMediaSourceSheet((prev) => ({ ...prev, visible: false }))}
          onSelect={handleMediaSourceSelect}
          title={mediaSourceSheet.target === 'avatar' ? 'Group photo' : 'Cover photo'}
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen header={<FlagshipHeader title="New group" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
      <View style={styles.selectRoot}>
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <AppInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by username..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            inputContainerStyle={styles.searchInputWrap}
            inputStyle={styles.searchInput}
            accessibilityLabel="Search members"
            accessibilityHint="Search for users to add to the group"
          />
          {searchQuery.length > 0 && (
            <AnimatedPressable
              onPress={() => setSearchQuery('')}
              activeOpacity={0.7}
              scaleValue={0.9}
              hapticFeedback="light"
              accessibilityLabel="Clear search"
              accessibilityRole="button"
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </AnimatedPressable>
          )}
        </View>

      {selectedIds.length > 0 && (
        <View style={styles.selectedRail}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedRailContent}>
            {selectedIds.map((id) => {
              const user = selectedUsers.get(id);
              const displayName = user?.displayName ?? user?.username ?? 'User';
              return (
                <Pressable
                  key={id}
                  onPress={() => user && toggleMember(user)}
                  style={styles.selectedChip}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${displayName} from selection`}
                >
                  {user?.avatar ? (
                    <CachedImage uri={user.avatar} style={styles.selectedChipAvatar} contentFit="cover" />
                  ) : (
                    <View style={styles.selectedChipAvatarPlaceholder}>
                      <Text style={styles.selectedChipAvatarText}>{displayName[0]?.toUpperCase() ?? '?'}</Text>
                    </View>
                  )}
                  <Text style={styles.selectedChipText} numberOfLines={1}>{displayName}</Text>
                  <Ionicons name="close-circle" size={14} color={colors.textMuted} />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {searchError ? (
        <View style={styles.searchErrorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={styles.searchErrorText}>{searchError}</Text>
          <Pressable
            onPress={() => void performSearch(searchQuery)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Retry search"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {!searchQuery.trim() ? (
        showRecents ? (
          <ScrollView
            style={styles.recentsScroll}
            contentContainerStyle={styles.recentsContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {recentUsers.length > 0 && (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionHeaderText}>Recent</Text>
                {recentUsers.map((user) => (
                  <React.Fragment key={user.id}>
                    {renderMemberRow({ item: user })}
                  </React.Fragment>
                ))}
              </View>
            )}
            {suggestedUsers.length > 0 && (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionHeaderText}>Suggested</Text>
                {suggestedUsers.map((user) => (
                  <React.Fragment key={user.id}>
                    {renderMemberRow({ item: user })}
                  </React.Fragment>
                ))}
              </View>
            )}
          </ScrollView>
        ) : (
          <View style={styles.emptyWrap}>
            <Ionicons name="search-outline" size={32} color={colors.textMuted} />
            <Caption color={colors.textMuted} style={styles.emptyText}>
              Search by username to add members to your group.
            </Caption>
          </View>
        )
      ) : isSearching ? (
        <View style={styles.listWrap}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <View style={styles.skeletonAvatar} />
              <View style={styles.skeletonTextWrap}>
                <View style={styles.skeletonLine} />
                <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
              </View>
            </View>
          ))}
        </View>
      ) : filteredResults.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="people-outline" size={32} color={colors.textMuted} />
          <Caption color={colors.textMuted} style={styles.emptyText}>
            {hasSearched && !searchError ? 'No users match your search.' : 'Type at least 2 characters to search.'}
          </Caption>
        </View>
      ) : (
        <FlashList
          data={filteredResults}
          keyExtractor={(item) => item.id}
          renderItem={renderMemberRow}
          contentContainerStyle={styles.memberList}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={[styles.stickyAction, { paddingBottom: Math.max(insets.bottom, Space.sm) + 8 }]}>
        <AppButton
          style={[styles.createBtn, selectedIds.length < MIN_MEMBERS && styles.createBtnDisabled]}
          variant="primary"
          size="md"
          align="center"
          title={`Next step${selectedIds.length > 0 ? ` · ${selectedIds.length}` : ''}`}
          onPress={handleContinueToDetails}
          disabled={selectedIds.length < MIN_MEMBERS}
          accessibilityLabel={`Continue to group details with ${selectedIds.length} member${selectedIds.length === 1 ? '' : 's'}`}
          accessibilityRole="button"
        />
      </View>
      </View>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  /* ── Stage 1: Select ── */
  selectRoot: {
    flex: 1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  searchInputWrap: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: 'transparent',
    minHeight: Control.hit,
    paddingHorizontal: 0 },
  searchInput: {
    fontSize: TypographyV2.body.size,
    color: colors.textPrimary,
    paddingVertical: 0 },
  selectedRail: {
    marginBottom: Space.sm },
  selectedRailContent: {
    gap: Space.sm,
    paddingHorizontal: Space.md },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2 + 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  selectedChipAvatar: {
    width: Space.smMd,
    height: Space.smMd,
    borderRadius: Radius.full },
  selectedChipAvatarPlaceholder: {
    width: Space.smMd,
    height: Space.smMd,
    borderRadius: Radius.full,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center' },
  selectedChipAvatarText: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textPrimary },
  selectedChipText: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textPrimary },
  searchErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: colors.dangerSubtle,
    borderRadius: Radius.md,
    marginHorizontal: Space.md,
    marginBottom: Space.sm },
  searchErrorText: {
    flex: 1,
    color: colors.danger,
    fontSize: TypographyV2.meta.size },
  memberList: {
    paddingBottom: Space.xxl + 24 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    minHeight: Space.xl + Space.xl + 8 },
  memberRowPressed: {
    backgroundColor: colors.surfaceAlt },
  memberAvatar: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full },
  memberAvatarPlaceholder: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center' },
  memberAvatarText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypeStyles.title.fontFamily,
    color: colors.textPrimary },
  memberTextWrap: {
    flex: 1 },
  memberDisplayName: {
    fontSize: TypographyV2.body.size,
    color: colors.textPrimary },
  memberUsername: {
    fontSize: TypographyV2.meta.size,
    color: colors.textMuted },
  checkCircle: {
    width: Space.lg + 4,
    height: Space.lg + 4,
    justifyContent: 'center',
    alignItems: 'center' },
  checkCircleActive: {
    backgroundColor: colors.brand,
    borderRadius: Radius.full },
  listWrap: {
    flex: 1,
    paddingHorizontal: Space.md },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingVertical: Space.sm + 2 },
  skeletonAvatar: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt },
  skeletonTextWrap: {
    flex: 1,
    gap: Space.xs + 2 },
  skeletonLine: {
    height: Space.xs + 4,
    borderRadius: Radius.sm,
    backgroundColor: colors.surfaceAlt },
  skeletonLineShort: {
    width: '40%' },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.xl },
  emptyText: {
    textAlign: 'center',
    paddingHorizontal: Space.lg },
  recentsScroll: {
    flex: 1 },
  recentsContent: {
    paddingBottom: Space.xxl + 24 },
  sectionBlock: {
    marginBottom: Space.lg },
  sectionHeaderText: {
    fontSize: TypographyV2.meta.size,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.textMuted,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
    textTransform: 'uppercase' },

  /* ── Stage 2: Details ── */
  detailsRoot: {
    flex: 1 },
  detailsScroll: {
    flex: 1 },
  detailsContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg },
  avatarSelectorWrap: {
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.lg },
  // Cover photo
  coverSelector: {
    width: '100%',
    height: 140,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Space.md,
    position: 'relative' },
  coverImage: {
    width: '100%',
    height: '100%' },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs },
  coverPlaceholderText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily },
  coverUploadingOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center' },
  avatarSelectorPressable: {
    position: 'relative',
    borderRadius: Radius.full },
  avatarSelectorPressed: {
    opacity: 0.7 },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: Space.lg + 4,
    height: Space.lg + 4,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.surface },
  avatarUploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center' },
  avatarHint: {
    fontSize: TypographyV2.meta.size },
  removeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    marginTop: Space.xs / 2 },
  mediaErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs,
    paddingHorizontal: Space.sm },
  mediaErrorText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight },
  coverRemoveBtn: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  fieldGroup: {
    marginBottom: Space.lg },
  fieldLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    color: colors.textPrimary,
    marginBottom: Space.xs + 2 },
  fieldInputWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: Radius.md,
    minHeight: Space.xxl,
    paddingHorizontal: Space.sm + 2 },
  fieldInput: {
    fontSize: TypographyV2.body.size,
    color: colors.textPrimary },
  fieldInputWrapMultiline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: Radius.md,
    minHeight: Space.xxl + Space.xl,
    paddingHorizontal: Space.sm + 2 },
  fieldInputMultiline: {
    fontSize: TypographyV2.body.size,
    color: colors.textPrimary },
  charCount: {
    textAlign: 'right',
    marginTop: Space.xs / 2,
    fontSize: TypographyV2.meta.size,
    color: colors.textMuted },
  participantSection: {
    marginTop: Space.sm },
  participantHeader: {
    marginBottom: Space.sm },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingVertical: Space.sm },
  participantAvatar: {
    width: Space.xl + Space.xs,
    height: Space.xl + Space.xs,
    borderRadius: Radius.full },
  participantAvatarPlaceholder: {
    width: Space.xl + Space.xs,
    height: Space.xl + Space.xs,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center' },
  participantAvatarText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypeStyles.title.fontFamily,
    color: colors.textPrimary },
  participantTextWrap: {
    flex: 1 },
  participantName: {
    fontSize: TypographyV2.body.size,
    color: colors.textPrimary },
  participantHandle: {
    fontSize: TypographyV2.meta.size,
    color: colors.textMuted },

  /* ── Shared ── */
  createErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: colors.dangerSubtle,
    borderRadius: Radius.md,
    marginHorizontal: Space.md,
    marginBottom: Space.sm },
  createErrorText: {
    flex: 1,
    color: colors.danger,
    fontSize: TypographyV2.meta.size },
  retryText: {
    color: colors.brand,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily },
  stickyAction: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm },
  createBtn: {
    height: Space.xxl + 2,
    borderRadius: Radius.lg },
  createBtnDisabled: {
    opacity: 0.5 } });
}
