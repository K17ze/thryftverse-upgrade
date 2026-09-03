import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { useStore } from '../store/useStore';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AppSearchBar } from '../components/ui/AppSearchBar';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { ActionSheet } from '../components/sheets/ActionSheet';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';
import {
  addConversationMembersOnApi,
  fetchGroupSettingsFromApi,
  removeConversationMemberOnApi,
  leaveGroupOnApi,
  promoteConversationMemberOnApi,
  demoteConversationMemberOnApi,
  transferConversationOwnershipOnApi } from '../services/chatApi';
import { searchUsers, type UserSearchResult } from '../services/profileApi';
import { parseApiError } from '../lib/apiClient';
import { useChatGroupMembershipEvent } from '../services/realtimeClient';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupMembers'>;

type MemberRole = 'owner' | 'admin' | 'member';

export default function GroupMembersScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();

  const conversations = useStore((state) => state.conversations);
  const currentUser = useStore((state) => state.currentUser);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const deleteConversation = useStore((state) => state.deleteConversation);
  const reconcileGroupMembershipEvent = useStore((state) => state.reconcileGroupMembershipEvent);

  useChatGroupMembershipEvent(conversationId, (event) => {
    const removedUserId = event.type === 'chat.member.removed'
      ? event.payload.memberUserId
      : event.type === 'chat.member.left'
        ? event.payload.actorUserId
        : null;
    reconcileGroupMembershipEvent(event);
    if (removedUserId && removedUserId === currentUser?.id) {
      deleteConversation(conversationId);
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Inbox' } }] });
    }
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [memberActionMenu, setMemberActionMenu] = useState<{
    member: { id: string; name: string; role: MemberRole };
    actions: Array<{ label: string; destructive?: boolean; onPress: () => void }>;
  } | null>(null);

  // Add-members flow state
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  // Build a participant name lookup from the conversation's participant profiles,
  // same pattern used by InboxScreen. Avoids unsafe store type casts.
  const participantNameLookup = useMemo(() => {
    const map = new Map<string, string>();
    if (currentUser?.id) {
      map.set(currentUser.id, currentUser.displayName ?? currentUser.username ?? 'you');
    }
    for (const profile of conversation?.participantProfiles ?? []) {
      map.set(profile.id, profile.displayName ?? profile.username ?? `User ${profile.id.slice(-6)}`);
    }
    return map;
  }, [conversation?.participantProfiles, currentUser]);

  const currentRole: MemberRole | undefined = useMemo(() => {
    if (!currentUser?.id) return undefined;
    if (conversation?.ownerId === currentUser.id) return 'owner';
    const role = conversation?.memberRoles?.[currentUser.id];
    if (role === 'admin') return 'admin';
    if (role === 'owner') return 'owner';
    return 'member';
  }, [conversation, currentUser?.id]);

  const canManage = currentRole === 'owner' || currentRole === 'admin';
  const [canAddMembers, setCanAddMembers] = useState(canManage);

  useEffect(() => {
    let active = true;
    if (canManage) {
      setCanAddMembers(true);
      return () => {
        active = false;
      };
    }
    fetchGroupSettingsFromApi(conversationId)
      .then((snapshot) => {
        if (active) setCanAddMembers(snapshot.capabilities.canAddMembers);
      })
      .catch(() => {
        if (active) setCanAddMembers(false);
      });
    return () => {
      active = false;
    };
  }, [canManage, conversationId]);

  // Determine roles from memberRoles / ownerId
  const members = useMemo(() => {
    const ids = conversation?.participantIds ?? [];
    return ids.map((id) => {
      const name = id === currentUser?.id
        ? 'You'
        : participantNameLookup?.get(id) ?? `User ${id.slice(-6)}`;
      let role: MemberRole = 'member';
      if (id === conversation?.ownerId) {
        role = 'owner';
      } else if (conversation?.memberRoles?.[id] === 'admin') {
        role = 'admin';
      } else if (conversation?.memberRoles?.[id] === 'owner') {
        role = 'owner';
      }
      return {
        id,
        name,
        isMe: id === currentUser?.id,
        role };
    });
  }, [conversation, currentUser?.id, participantNameLookup]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().includes(q));
  }, [members, searchQuery]);

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
      const existingIds = new Set(conversation?.participantIds ?? []);
      const filtered = results.filter((r) => r.id !== currentUser?.id && !existingIds.has(r.id));
      setSearchResults(filtered);
      setHasSearched(true);
    } catch (err) {
      setSearchResults([]);
      setHasSearched(true);
      setSearchError(parseApiError(err, 'Search failed. Check your connection.').message);
    } finally {
      setIsSearching(false);
    }
  }, [conversation?.participantIds, currentUser?.id]);

  useEffect(() => {
    if (!showAddMembers) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!addQuery.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      setIsSearching(false);
      setSearchError('');
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      void performSearch(addQuery);
    }, 350);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [addQuery, performSearch, showAddMembers]);

  const toggleSelectToAdd = (userId: string) => {
    haptic.light();
    setSelectedToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleAddMembers = async () => {
    if (selectedToAdd.size === 0) return;
    haptic.medium();
    setIsAdding(true);
    try {
      const result = await addConversationMembersOnApi(conversationId, Array.from(selectedToAdd));
      upsertConversation({
        ...conversation!,
        participantIds: result.participantIds });
      show(`${selectedToAdd.size} member${selectedToAdd.size === 1 ? '' : 's'} added`, 'success');
      setSelectedToAdd(new Set());
      setAddQuery('');
      setSearchResults([]);
      setHasSearched(false);
      setShowAddMembers(false);
    } catch (err) {
      show(parseApiError(err, 'Could not add members. Try again.').message, 'error');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveMember = (memberId: string, memberName: string) => {
    setConfirmSheet({
      visible: true,
      title: 'Remove member?',
      message: `Remove ${memberName} from this group?`,
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.heavy();
        setRemovingId(memberId);
        try {
          const result = await removeConversationMemberOnApi(conversationId, memberId);
          upsertConversation({
            ...conversation!,
            participantIds: result.participantIds });
          show('Member removed', 'info');
        } catch (err) {
          show(parseApiError(err, 'Could not remove member. Try again.').message, 'error');
        } finally {
          setRemovingId(null);
        }
      } });
  };

  const handlePromoteMember = (memberId: string, memberName: string) => {
    setConfirmSheet({
      visible: true,
      title: 'Promote to admin?',
      message: `${memberName} will be able to manage members, edit group info, and remove others.`,
      confirmLabel: 'Promote',
      variant: 'default',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.medium();
        setRemovingId(memberId);
        try {
          const result = await promoteConversationMemberOnApi(conversationId, memberId);
          upsertConversation({
            ...conversation!,
            memberRoles: Object.fromEntries(
              Object.entries(result.memberRoles).filter(
                (entry): entry is [string, 'owner' | 'admin' | 'member'] =>
                  entry[1] === 'owner' || entry[1] === 'admin' || entry[1] === 'member',
              ),
            ) as Record<string, 'owner' | 'admin' | 'member'> });
          show(`${memberName} is now an admin.`, 'success');
        } catch (err) {
          show(parseApiError(err, 'Could not promote member.').message, 'error');
        } finally {
          setRemovingId(null);
        }
      } });
  };

  const handleDemoteMember = (memberId: string, memberName: string) => {
    setConfirmSheet({
      visible: true,
      title: 'Demote admin?',
      message: `${memberName} will no longer have admin privileges.`,
      confirmLabel: 'Demote',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.medium();
        setRemovingId(memberId);
        try {
          const result = await demoteConversationMemberOnApi(conversationId, memberId);
          upsertConversation({
            ...conversation!,
            memberRoles: Object.fromEntries(
              Object.entries(result.memberRoles).filter(
                (entry): entry is [string, 'owner' | 'admin' | 'member'] =>
                  entry[1] === 'owner' || entry[1] === 'admin' || entry[1] === 'member',
              ),
            ) as Record<string, 'owner' | 'admin' | 'member'> });
          show(`${memberName} is now a member.`, 'info');
        } catch (err) {
          show(parseApiError(err, 'Could not demote member.').message, 'error');
        } finally {
          setRemovingId(null);
        }
      } });
  };

  const handleTransferOwnership = (memberId: string, memberName: string) => {
    setConfirmSheet({
      visible: true,
      title: 'Transfer ownership?',
      message: `You will no longer be the owner. ${memberName} will become the new group owner and have full control.`,
      confirmLabel: 'Transfer',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.heavy();
        setRemovingId(memberId);
        try {
          const result = await transferConversationOwnershipOnApi(conversationId, memberId);
          upsertConversation({
            ...conversation!,
            ownerId: result.ownerId,
            memberRoles: Object.fromEntries(
              Object.entries(result.memberRoles).filter(
                (entry): entry is [string, 'owner' | 'admin' | 'member'] =>
                  entry[1] === 'owner' || entry[1] === 'admin' || entry[1] === 'member',
              ),
            ) as Record<string, 'owner' | 'admin' | 'member'> });
          show(`Ownership transferred to ${memberName}.`, 'success');
        } catch (err) {
          show(parseApiError(err, 'Could not transfer ownership.').message, 'error');
        } finally {
          setRemovingId(null);
        }
      } });
  };

  const handleMemberLongPress = (member: { id: string; name: string; role: MemberRole }) => {
    if (!canManage || member.id === currentUser?.id) return;
    const isOwner = currentUser?.id === conversation?.ownerId;
    const actions: Array<{ label: string; destructive?: boolean; onPress: () => void }> = [];

    if (member.role === 'member') {
      actions.push({ label: 'Promote to admin', onPress: () => handlePromoteMember(member.id, member.name) });
    } else if (member.role === 'admin') {
      actions.push({ label: 'Demote to member', onPress: () => handleDemoteMember(member.id, member.name) });
    }
    actions.push({ label: 'Remove from group', destructive: true, onPress: () => handleRemoveMember(member.id, member.name) });

    // Only owner can transfer ownership
    if (isOwner && member.id !== currentUser?.id) {
      actions.push({ label: 'Transfer ownership', destructive: true, onPress: () => handleTransferOwnership(member.id, member.name) });
    }
    setMemberActionMenu({ member, actions });
  };

  const handleLeaveGroup = () => {
    setConfirmSheet({
      visible: true,
      title: 'Leave group?',
      message: 'You will be removed from this group on all devices. Other members will keep their copy.',
      confirmLabel: 'Leave group',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.heavy();
        setIsLeaving(true);
        try {
          await leaveGroupOnApi(conversationId, currentUser?.id ?? '');
          deleteConversation(conversationId);
          show('You left the group', 'info');
          navigation.navigate('MainTabs', { screen: 'Inbox' });
        } catch (err) {
          show(parseApiError(err, 'Could not leave group. Try again.').message, 'error');
        } finally {
          setIsLeaving(false);
        }
      } });
  };

  if (!conversation || conversation.type !== 'group') {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Members" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
        <View style={styles.center}>
          <Caption color={colors.textMuted}>Group not found</Caption>
        </View>
      </FlagshipScreen>
    );
  }

  const roleBadge = (role: MemberRole) => {
    const roleColors = {
      owner: { bg: colors.brandSubtle, text: colors.brand },
      // TODO: replace `${colors.textPrimary}15` with textPrimarySubtle token when available
      admin: { bg: `${colors.textPrimary}15`, text: colors.textPrimary },
      member: { bg: colors.surfaceAlt, text: colors.textMuted } };
    const labels = { owner: 'Owner', admin: 'Admin', member: 'Member' };
    return (
      <View style={[styles.roleBadge, { backgroundColor: roleColors[role].bg }]}>
        <Caption style={[styles.roleBadgeText, { color: roleColors[role].text }]}>{labels[role]}</Caption>
      </View>
    );
  };

  return (
    <FlagshipScreen header={<FlagshipHeader title="Members" subtitle={`${members.length} total`} onBack={() => navigation.goBack()} />} scrollEnabled={false}>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Search */}
        <AppSearchBar
          placeholder="Search members..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onClear={() => setSearchQuery('')}
          containerStyle={styles.searchRow}
        />

        {/* Add members section */}
        {canAddMembers && !showAddMembers && (
          <AnimatedPressable
            onPress={() => setShowAddMembers(true)}
            activeOpacity={0.7}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Add members"
            style={styles.addRow}
          >
            <View style={[styles.addAvatar, { backgroundColor: colors.brandSubtle }]}>
              <Ionicons name="person-add-outline" size={20} color={colors.brand} />
            </View>
            <BodyEmphasis style={{ color: colors.brand }}>Add members</BodyEmphasis>
          </AnimatedPressable>
        )}

        {/* Inline add-members search */}
        {showAddMembers && (
          <View style={styles.addMembersSection}>
            <View style={styles.addMembersHeader}>
              <AppSearchBar
                placeholder="Search by username..."
                value={addQuery}
                onChangeText={setAddQuery}
                onClear={() => setAddQuery('')}
                containerStyle={styles.addSearchRow}
              />
              <Pressable
                onPress={() => {
                  setShowAddMembers(false);
                  setAddQuery('');
                  setSearchResults([]);
                  setSelectedToAdd(new Set());
                  setHasSearched(false);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Cancel add members"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>

            {isSearching && (
              <View style={styles.searchingRow}>
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            )}

            {!isSearching && searchError ? (
              <Caption color={colors.danger} style={styles.searchStatusText}>{searchError}</Caption>
            ) : null}

            {!isSearching && hasSearched && searchResults.length === 0 && !searchError ? (
              <Caption color={colors.textMuted} style={styles.searchStatusText}>No users found.</Caption>
            ) : null}

            {!isSearching && searchResults.length > 0 && (
              <View style={styles.searchResultList}>
                {searchResults.map((user, idx) => {
                  const isSelected = selectedToAdd.has(user.id);
                  return (
                    <View key={user.id}>
                      <Pressable
                        onPress={() => toggleSelectToAdd(user.id)}
                        style={({ pressed }) => [styles.searchResultRow, pressed && styles.rowPressed]}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${user.displayName ?? user.username}`}
                      >
                        <View style={[styles.memberAvatarV2, { backgroundColor: colors.surfaceAlt }]}>
                          <Text style={styles.memberAvatarTextV2}>
                            {(user.displayName ?? user.username).slice(0, 2).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.memberTextV2}>
                          <BodyEmphasis numberOfLines={1}>{user.displayName ?? user.username}</BodyEmphasis>
                          <Caption color={colors.textMuted} numberOfLines={1}>@{user.username}</Caption>
                        </View>
                        <View style={[styles.selectCircle, isSelected && { backgroundColor: colors.brand, borderColor: colors.brand }]}>
                          <Ionicons name="checkmark" size={16} color={colors.surface} />
                        </View>
                      </Pressable>
                      {idx < searchResults.length - 1 && <View style={styles.memberDivider} />}
                    </View>
                  );
                })}
              </View>
            )}

            {selectedToAdd.size > 0 && (
              <AnimatedPressable
                onPress={handleAddMembers}
                activeOpacity={0.7}
                scaleValue={0.97}
                hapticFeedback="medium"
                accessibilityRole="button"
                accessibilityLabel="Add selected members"
                style={styles.addConfirmBtn}
              >
                {isAdding ? (
                  <ActivityIndicator size="small" color={colors.surface} />
                ) : (
                  <Text style={styles.addConfirmText}>
                    Add {selectedToAdd.size} member{selectedToAdd.size === 1 ? '' : 's'}
                  </Text>
                )}
              </AnimatedPressable>
            )}
          </View>
        )}

        {/* Member list */}
        {filteredMembers.length === 0 ? (
          <View style={styles.emptyWrapV2}>
            <Ionicons name="people-outline" size={32} color={colors.textMuted} />
            <Caption color={colors.textMuted} style={styles.emptyTextV2}>No members match your search.</Caption>
          </View>
        ) : (
          <View style={styles.memberList}>
            {filteredMembers.map((member, index) => {
              const canRemove = canManage && !member.isMe && member.role !== 'owner';
              const isRemovingThis = removingId === member.id;
              return (
                <View key={member.id}>
                  <View style={styles.memberRowV2}>
                    <AnimatedPressable
                      onPress={() => openProfile(navigation, member.id, currentUser?.id)}
                      onLongPress={() => handleMemberLongPress(member)}
                      delayLongPress={400}
                      activeOpacity={0.85}
                      scaleValue={0.98}
                      hapticFeedback="light"
                      accessibilityRole="button"
                      accessibilityLabel={`View ${member.name} profile`}
                      accessibilityHint="Long-press for admin actions"
                      style={styles.memberRowContent}
                    >
                      <View style={[styles.memberAvatarV2, { backgroundColor: colors.surfaceAlt }]}>
                        <Text style={styles.memberAvatarTextV2}>
                          {member.name.slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.memberTextV2}>
                        <View style={styles.nameRowV2}>
                          <BodyEmphasis>{member.name}</BodyEmphasis>
                          {roleBadge(member.role)}
                        </View>
                        {member.role === 'owner' && (
                          <Caption color={colors.textMuted}>{member.isMe ? 'You · Group creator' : 'Group creator'}</Caption>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                    </AnimatedPressable>

                    {member.isMe ? (
                      <Pressable
                        onPress={handleLeaveGroup}
                        disabled={isLeaving}
                        hitSlop={8}
                        style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}
                        accessibilityRole="button"
                        accessibilityLabel="Leave group"
                      >
                        {isLeaving ? (
                          <ActivityIndicator size="small" color={colors.danger} />
                        ) : (
                          <Text style={styles.leaveText}>Leave</Text>
                        )}
                      </Pressable>
                    ) : canRemove ? (
                      <Pressable
                        onPress={() => handleRemoveMember(member.id, member.name)}
                        disabled={isRemovingThis}
                        hitSlop={8}
                        style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${member.name}`}
                      >
                        {isRemovingThis ? (
                          <ActivityIndicator size="small" color={colors.danger} />
                        ) : (
                          <Text style={styles.removeText}>Remove</Text>
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                  {index < filteredMembers.length - 1 && (
                    <View style={styles.memberDivider} />
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'danger'}
        onConfirm={confirmSheet.onConfirm}
      />
      <ActionSheet
        visible={memberActionMenu !== null}
        onDismiss={() => setMemberActionMenu(null)}
      >
        {memberActionMenu && (
          <View style={styles.memberActionSheet}>
            <Text style={styles.memberActionTitle}>{memberActionMenu.member.name}</Text>
            {memberActionMenu.actions.map((action) => (
              <Pressable
                key={action.label}
                style={({ pressed }) => [styles.memberActionRow, pressed && styles.memberActionRowPressed]}
                onPress={() => {
                  setMemberActionMenu(null);
                  action.onPress();
                }}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <Text style={[styles.memberActionLabel, action.destructive && styles.memberActionLabelDanger]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </ActionSheet>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center' },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
    gap: Space.md },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.smMd,
    gap: Space.sm },
  memberAvatar: {
    width: Space.xl + 8,
    height: Space.xl + 8,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center' },
  memberAvatarText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary },
  memberText: {
    flex: 1,
    justifyContent: 'center' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: Space.md + 40 + Space.sm },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.smMd,
    paddingVertical: Space.sm,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: Space.sm },
  searchInput: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  roleBadge: {
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs - 2,
    borderRadius: Radius.sm },
  roleBadgeText: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: TypographyV2.meta.fontFamily },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl,
    gap: Space.sm,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  emptyText: {
    textAlign: 'center' },
  memberList: {
    gap: 0 },
  memberRowV2: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    gap: Space.smMd },
  memberRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd },
  memberAvatarV2: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center' },
  memberAvatarTextV2: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  memberTextV2: {
    flex: 1,
    justifyContent: 'center' },
  nameRowV2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  memberDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: Space.md + 44 + Space.smMd,
    marginRight: Space.md },
  emptyWrapV2: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl,
    gap: Space.sm },
  emptyTextV2: {
    textAlign: 'center' },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd,
    paddingHorizontal: Space.md,
    minHeight: Control.hit },
  addAvatar: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center' },
  addMembersSection: {
    gap: Space.sm },
  addMembersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  addSearchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.smMd,
    paddingVertical: Space.sm,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  cancelText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.brand },
  searchingRow: {
    paddingVertical: Space.sm,
    alignItems: 'center' },
  searchStatusText: {
    paddingVertical: Space.sm,
    textAlign: 'center' },
  searchResultList: {
    gap: 0 },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    gap: Space.smMd,
    minHeight: Control.hit },
  rowPressed: {
    opacity: 0.6 },
  selectCircle: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center' },
  addConfirmBtn: {
    backgroundColor: colors.brand,
    borderRadius: Radius.lg,
    paddingVertical: Space.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Control.hit,
    marginTop: Space.xs },
  addConfirmText: {
    color: colors.surface,
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  actionBtn: {
    minWidth: Control.hit,
    minHeight: Control.hit,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Space.sm },
  actionPressed: {
    opacity: 0.5 },
  removeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.danger },
  leaveText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.danger },
  memberActionSheet: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm },
  memberActionTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    color: colors.textPrimary,
    paddingVertical: Space.smMd },
  memberActionRow: {
    minHeight: Control.hit,
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border },
  memberActionRowPressed: {
    opacity: 0.58 },
  memberActionLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  memberActionLabelDanger: {
    color: colors.danger } });
}
