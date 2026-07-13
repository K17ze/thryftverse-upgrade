import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { CachedImage } from '../components/CachedImage';
import { createGroupConversationOnApi } from '../services/chatApi';
import { searchUsers, UserSearchResult } from '../services/profileApi';
import { parseApiError } from '../lib/apiClient';
import { createStableId } from '../utils/createStableId';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AppInput } from '../components/ui/AppInput';
import { AppButton } from '../components/ui/AppButton';
import { Space, Radius, Type, TypeStyles } from '../theme/designTokens';
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
  validateGroupTitle,
} from '../utils/chatGroupHelpers';
import type { SelectableUser as HelperSelectableUser, Stage } from '../utils/chatGroupHelpers';

type Props = StackScreenProps<RootStackParamList, 'CreateGroupChat'>;

interface SelectableUser extends UserSearchResult {
  displayName: string | null;
  avatar: string | null;
}

export default function CreateGroupChatScreen({ navigation }: Props) {
  const currentUser = useStore((state) => state.currentUser);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const isBlockedUser = useStore((state) => state.isBlockedUser);
  const { show } = useToast();
  const { colors, isDark } = useAppTheme();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();

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
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const idempotencyKeyRef = useRef<string>(createStableId('group'));
  const createAttemptRef = useRef(false);

  const filteredResults = useMemo(() => {
    return searchResults.filter((user) => !isBlockedUser(user.id));
  }, [searchResults, isBlockedUser]);

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
      });

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
                  <Pressable onPress={handleRetryCreate} hitSlop={8}>
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                </View>
              ) : null}
              <View style={[styles.stickyAction, { paddingBottom: Math.max(insets.bottom, Space.sm) + 8 }]}>
                <AppButton
                  style={[styles.createBtn, (!title.trim() || isCreating) && styles.createBtnDisabled]}
                  variant="primary"
                  size="md"
                  align="center"
                  title={isCreating ? 'Creating...' : 'Create Group'}
                  onPress={() => void handleCreateGroup()}
                  disabled={!title.trim() || isCreating}
                  accessibilityLabel={isCreating ? 'Creating group chat' : 'Create group chat'}
                  accessibilityRole="button"
                />
              </View>
            </>
          }
        >
          <View style={styles.avatarSelectorWrap}>
            <View style={styles.avatarSelector}>
              <Ionicons name="camera-outline" size={28} color={colors.textMuted} />
            </View>
            <Caption color={colors.textMuted} style={styles.avatarHint}>Group photo</Caption>
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
        <View style={styles.emptyWrap}>
          <Ionicons name="search-outline" size={32} color={colors.textMuted} />
          <Caption color={colors.textMuted} style={styles.emptyText}>
            Search by username to add members to your group.
          </Caption>
        </View>
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
          title={`Continue${selectedIds.length > 0 ? ` · ${selectedIds.length}` : ''}`}
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

const styles = StyleSheet.create({
  /* ── Stage 1: Select ── */
  selectRoot: {
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  searchInputWrap: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: 'transparent',
    minHeight: 44,
    paddingHorizontal: 0,
  },
  searchInput: {
    fontSize: Type.body.size,
    paddingVertical: 0,
  },
  selectedRail: {
    marginBottom: Space.sm,
  },
  selectedRailContent: {
    gap: Space.sm,
    paddingHorizontal: Space.md,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  selectedChipAvatar: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
  },
  selectedChipAvatarPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedChipAvatarText: {
    fontSize: 10,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  selectedChipText: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  searchErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  searchErrorText: {
    flex: 1,
    fontSize: Type.caption.size,
  },
  memberList: {
    paddingBottom: Space.xxl + 24,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    minHeight: 56,
  },
  memberRowPressed: {
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
  },
  memberAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: TypeStyles.title.fontFamily,
  },
  memberTextWrap: {
    flex: 1,
  },
  memberDisplayName: {
    fontSize: Type.body.size,
  },
  memberUsername: {
    fontSize: Type.caption.size,
  },
  checkCircle: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkCircleActive: {
    borderRadius: Radius.full,
  },
  listWrap: {
    flex: 1,
    paddingHorizontal: Space.md,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingVertical: Space.sm + 2,
  },
  skeletonAvatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
  },
  skeletonTextWrap: {
    flex: 1,
    gap: 6,
  },
  skeletonLine: {
    height: 12,
    borderRadius: Radius.sm,
  },
  skeletonLineShort: {
    width: '40%',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.xl,
  },
  emptyText: {
    textAlign: 'center',
    paddingHorizontal: Space.lg,
  },

  /* ── Stage 2: Details ── */
  detailsRoot: {
    flex: 1,
  },
  detailsScroll: {
    flex: 1,
  },
  detailsContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
  },
  avatarSelectorWrap: {
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.lg,
  },
  avatarSelector: {
    width: 80,
    height: 80,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatarHint: {
    fontSize: Type.caption.size,
  },
  fieldGroup: {
    marginBottom: Space.lg,
  },
  fieldLabel: {
    fontSize: Type.bodyEmphasis.size,
    marginBottom: Space.xs + 2,
  },
  fieldInputWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    minHeight: 48,
    paddingHorizontal: Space.sm + 2,
  },
  fieldInput: {
    fontSize: Type.body.size,
  },
  fieldInputWrapMultiline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    minHeight: 80,
    paddingHorizontal: Space.sm + 2,
  },
  fieldInputMultiline: {
    fontSize: Type.body.size,
  },
  charCount: {
    textAlign: 'right',
    marginTop: 2,
    fontSize: Type.caption.size,
  },
  participantSection: {
    marginTop: Space.sm,
  },
  participantHeader: {
    marginBottom: Space.sm,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingVertical: Space.sm,
  },
  participantAvatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
  },
  participantAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  participantAvatarText: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: TypeStyles.title.fontFamily,
  },
  participantTextWrap: {
    flex: 1,
  },
  participantName: {
    fontSize: Type.body.size,
  },
  participantHandle: {
    fontSize: Type.caption.size,
  },

  /* ── Shared ── */
  createErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  createErrorText: {
    flex: 1,
    fontSize: Type.caption.size,
  },
  retryText: {
    fontSize: Type.caption.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  stickyAction: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  createBtn: {
    height: 50,
    borderRadius: Radius.lg,
  },
  createBtnDisabled: {
    opacity: 0.5,
  },
});