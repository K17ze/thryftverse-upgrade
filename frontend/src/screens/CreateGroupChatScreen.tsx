import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { Colors } from '../constants/colors';
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
import { ChatCard } from '../components/chat/ChatCard';
import { Space, Radius, Type, TypeStyles } from '../theme/designTokens';
import { Meta, Caption, BodyEmphasis } from '../components/ui/Text';
import { useHaptic } from '../hooks/useHaptic';

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
  const haptic = useHaptic();

  const [title, setTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Map<string, SelectableUser>>(new Map());
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [searchResults, setSearchResults] = useState<SelectableUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const MAX_MEMBERS = 50;
  const MIN_MEMBERS = 1;

  const filteredResults = useMemo(() => {
    return searchResults.filter((user) => !isBlockedUser(user.id));
  }, [searchResults, isBlockedUser]);

  const toggleMember = (user: SelectableUser) => {
    haptic.light();
    setErrorMsg('');
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
      return;
    }
    setIsSearching(true);
    setHasSearched(false);
    try {
      const results = await searchUsers(trimmed, 20);
      const filtered = results
        .filter((r) => r.id !== currentUser?.id)
        .map((r) => ({ ...r, displayName: r.displayName, avatar: r.avatar }));
      setSearchResults(filtered);
      setHasSearched(true);
    } catch {
      setSearchResults([]);
      setHasSearched(true);
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
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      void performSearch(searchQuery);
    }, 350);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, performSearch]);

  const handleCreateGroup = async () => {
    const groupTitle = title.trim();
    if (!groupTitle) {
      setErrorMsg('Add a group title to continue.');
      return;
    }
    if (selectedIds.length < MIN_MEMBERS) {
      setErrorMsg(`Select at least ${MIN_MEMBERS} member${MIN_MEMBERS === 1 ? '' : 's'}.`);
      return;
    }

    setIsCreating(true);
    setErrorMsg('');

    try {
      const idempotencyKey = createStableId();
      const conversation = await createGroupConversationOnApi({
        title: groupTitle,
        memberIds: selectedIds,
        idempotencyKey,
      });

      upsertConversation(conversation);
      show('Group chat created.', 'success');
      navigation.replace('Chat', { conversationId: conversation.id });
    } catch (err) {
      setErrorMsg(parseApiError(err, 'Could not create the group. Check your connection and try again.').message);
      show('Could not create group chat. Please try again.', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <FlagshipScreen header={<FlagshipHeader title="Create Group Chat" onBack={() => navigation.goBack()} />} scrollEnabled={false}>

      <View style={styles.body}>
        {/* Title */}
        <ChatCard variant="surface" style={styles.titleCard}>
          <Meta color={Colors.textMuted} style={styles.label}>Group title</Meta>
          <AppInput
            value={title}
            onChangeText={(t) => { setTitle(t); setErrorMsg(''); }}
            placeholder="Example: Thryft Snipers"
            placeholderTextColor={Colors.textMuted}
            maxLength={40}
            inputContainerStyle={styles.inputWrap}
            inputStyle={styles.input}
            accessibilityLabel="Group title input"
            accessibilityHint="Enter a name for the new group chat"
          />
          <Caption color={Colors.textMuted} style={styles.charCount}>{title.length}/40</Caption>
        </ChatCard>

        {/* Selected rail */}
        {selectedIds.length > 0 && (
          <View style={styles.selectedRail}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedRailContent}>
              {selectedIds.map((id) => {
                const user = selectedUsers.get(id);
                const displayName = user?.displayName ?? user?.username ?? 'User';
                return (
                  <View key={id} style={styles.selectedChip}>
                    {user?.avatar ? (
                      <CachedImage uri={user.avatar} style={styles.selectedChipAvatar} contentFit="cover" />
                    ) : (
                      <View style={styles.selectedChipAvatarPlaceholder}>
                        <Text style={styles.selectedChipAvatarText}>{displayName[0]?.toUpperCase() ?? '?'}</Text>
                      </View>
                    )}
                    <Caption color={Colors.textPrimary} style={styles.selectedChipText}>@{user?.username ?? displayName}</Caption>
                    <AnimatedPressable
                      onPress={() => user && toggleMember(user)}
                      activeOpacity={0.7}
                      scaleValue={0.9}
                      hapticFeedback="light"
                    >
                      <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                    </AnimatedPressable>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={styles.sectionRow}>
          <BodyEmphasis>Members</BodyEmphasis>
          <Caption color={Colors.textMuted}>{selectedIds.length} / {MAX_MEMBERS}</Caption>
        </View>

        <ChatCard variant="surface" style={styles.searchCard}>
          <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
          <AppInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by username..."
            placeholderTextColor={Colors.textMuted}
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
            >
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </AnimatedPressable>
          )}
        </ChatCard>

        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={Colors.danger} />
            <Caption color={Colors.danger} style={styles.errorBannerText}>{errorMsg}</Caption>
          </View>
        ) : null}

        {!searchQuery.trim() ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="search-outline" size={36} color={Colors.textMuted} />
            <Caption color={Colors.textMuted} style={styles.emptyText}>
              Search by username to add members to your group.
            </Caption>
          </View>
        ) : isSearching ? (
          <View style={styles.emptyWrap}>
            <ActivityIndicator size="small" color={Colors.textMuted} />
            <Caption color={Colors.textMuted} style={styles.emptyText}>Searching...</Caption>
          </View>
        ) : filteredResults.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="people-outline" size={36} color={Colors.textMuted} />
            <Caption color={Colors.textMuted} style={styles.emptyText}>
              {hasSearched ? 'No users match your search.' : 'Type at least 2 characters to search.'}
            </Caption>
          </View>
        ) : (
          <FlashList
            data={filteredResults}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const selected = selectedIds.includes(item.id);
              const displayName = item.displayName ?? item.username;
              return (
                <View>
                  <ChatCard
                    variant={selected ? 'tint' : 'surface'}
                    style={[styles.memberRow, selected && styles.memberRowSelected]}
                  >
                    <AnimatedPressable
                      style={styles.memberSelectTap}
                      activeOpacity={0.85}
                      onPress={() => toggleMember(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`${selected ? 'Deselect' : 'Select'} @${item.username}`}
                      accessibilityHint="Toggles this member for the new group"
                      scaleValue={0.98}
                      hapticFeedback="light"
                    >
                      {item.avatar ? (
                        <CachedImage uri={item.avatar} style={styles.memberAvatar} contentFit="cover" />
                      ) : (
                        <View style={styles.memberAvatarPlaceholder}>
                          <Text style={styles.memberAvatarText}>{displayName[0]?.toUpperCase() ?? '?'}</Text>
                        </View>
                      )}

                      <View style={styles.memberTextWrap}>
                        <BodyEmphasis>@{item.username}</BodyEmphasis>
                        {item.displayName ? (
                          <Caption color={Colors.textSecondary}>{item.displayName}</Caption>
                        ) : null}
                      </View>

                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={selected ? Colors.brand : Colors.textMuted}
                      />
                    </AnimatedPressable>

                    <AnimatedPressable
                      style={styles.memberProfileBtn}
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
                      accessibilityRole="button"
                      accessibilityLabel={`Open @${item.username} profile`}
                      accessibilityHint="Shows this member profile details"
                      scaleValue={0.9}
                      hapticFeedback="light"
                    >
                      <Ionicons name="person-circle-outline" size={20} color={Colors.textPrimary} />
                    </AnimatedPressable>
                  </ChatCard>
                </View>
              );
            }}
            contentContainerStyle={styles.memberList}
            ItemSeparatorComponent={() => <View style={{ height: Space.sm + 2 }} />}
            showsVerticalScrollIndicator={false}
          />
        )}

        <AppButton
          style={[styles.createBtn, (!title.trim() || isCreating || selectedIds.length < MIN_MEMBERS) && styles.createBtnDisabled]}
          variant="primary"
          size="md"
          align="center"
          title={isCreating ? 'Creating...' : errorMsg ? 'Retry' : 'Create Group'}
          onPress={() => {
            void handleCreateGroup();
          }}
          disabled={!title.trim() || isCreating || selectedIds.length < MIN_MEMBERS}
          accessibilityLabel={isCreating ? 'Creating group chat' : 'Create group chat'}
          accessibilityRole="button"
        />
      </View>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  titleCard: {
    marginBottom: Space.md,
  },
  label: {
    marginBottom: Space.xs + 4,
  },
  inputWrap: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    minHeight: 44,
    paddingHorizontal: 0,
  },
  input: {
    fontSize: Type.body.size,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.sm + 2,
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    marginBottom: Space.sm + 2,
    paddingHorizontal: Space.sm + 4,
    paddingVertical: Space.sm,
  },
  searchInputWrap: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: 'transparent',
    minHeight: 40,
    paddingHorizontal: 0,
  },
  searchInput: {
    fontSize: Type.body.size,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  memberList: {
    paddingBottom: Space.xxl + 24,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Space.sm + 2,
  },
  memberRowSelected: {
    borderColor: Colors.brand,
  },
  memberSelectTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
  },
  memberAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: TypeStyles.title.fontFamily,
    color: Colors.textPrimary,
  },
  memberTextWrap: {
    flex: 1,
  },
  memberProfileBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Space.sm,
  },
  createBtn: {
    marginTop: Space.md,
    marginBottom: Space.lg,
    height: 50,
    borderRadius: Radius.lg,
  },
  createBtnDisabled: {
    opacity: 0.5,
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
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
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
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedChipAvatarText: {
    fontSize: 10,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: Colors.textPrimary,
  },
  charCount: {
    textAlign: 'right',
    marginTop: 2,
  },
  selectedChipText: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: `${Colors.danger}10`,
    borderRadius: Radius.md,
    marginBottom: Space.sm,
  },
  errorBannerText: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
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
});