import React, { useMemo, useState } from 'react';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
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
import { parseApiError } from '../lib/apiClient';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AppInput } from '../components/ui/AppInput';
import { AppButton } from '../components/ui/AppButton';
import { ChatCard } from '../components/chat/ChatCard';
import { Space, Radius, Type, TypeStyles, Elevation } from '../theme/designTokens';
import { Meta, Caption, BodyEmphasis } from '../components/ui/Text';
import { useHaptic } from '../hooks/useHaptic';

type Props = StackScreenProps<RootStackParamList, 'CreateGroupChat'>;

export default function CreateGroupChatScreen({ navigation }: Props) {
  const currentUser = useStore((state) => state.currentUser);
  const createGroupConversation = useStore((state) => state.createGroupConversation);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const { show } = useToast();
  const haptic = useHaptic();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const MAX_MEMBERS = 50;
  const MIN_MEMBERS = 1;

  const conversations = useStore((state) => state.conversations);

  const members = useMemo(() => {
    const participantIds = new Set<string>();
    for (const convo of conversations) {
      for (const pid of convo.participantIds ?? []) {
        if (pid !== 'me' && pid !== (currentUser?.id ?? 'me')) {
          participantIds.add(pid);
        }
      }
    }
    return Array.from(participantIds).map((id) => ({ id, username: id.slice(0, 8) }));
  }, [conversations, currentUser?.id]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const query = String(searchQuery).toLowerCase();
    return members.filter(
      (user) => String(user.username).toLowerCase().includes(query)
    );
  }, [members, searchQuery]);

  const toggleMember = (userId: string) => {
    haptic.light();
    setErrorMsg('');
    setSelectedIds((current) => {
      if (current.includes(userId)) {
        return current.filter((id) => id !== userId);
      }
      if (current.length >= MAX_MEMBERS) {
        show(`Groups are limited to ${MAX_MEMBERS} members`, 'error');
        return current;
      }
      return [...current, userId];
    });
  };

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
      const conversation = await createGroupConversationOnApi({
        title: groupTitle,
        memberIds: selectedIds,
      });

      upsertConversation(conversation);
      show('Group chat created.', 'success');
      navigation.replace('Chat', { conversationId: conversation.id });
      return;
    } catch {
      const conversationId = createGroupConversation({
        title: groupTitle,
        memberIds: selectedIds,
        creatorId: currentUser?.id ?? 'me',
      });

      show('Backend sync unavailable. Created locally.', 'info');
      navigation.replace('Chat', { conversationId });
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
        </ChatCard>

        {/* Description */}
        <ChatCard variant="surface" style={styles.titleCard}>
          <Meta color={Colors.textMuted} style={styles.label}>Description (optional)</Meta>
          <AppInput
            value={description}
            onChangeText={setDescription}
            placeholder="What is this group about?"
            placeholderTextColor={Colors.textMuted}
            maxLength={120}
            inputContainerStyle={styles.inputWrap}
            inputStyle={styles.input}
            accessibilityLabel="Group description input"
            accessibilityHint="Enter a short description for the group"
          />
        </ChatCard>

        {/* Selected rail */}
        {selectedIds.length > 0 && (
          <View style={styles.selectedRail}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedRailContent}>
              {selectedIds.map((id) => {
                const user = members.find((m) => m.id === id);
                return (
                  <View key={id} style={styles.selectedChip}>
                    <Caption color={Colors.textPrimary} style={styles.selectedChipText}>@{user?.username ?? id.slice(0, 8)}</Caption>
                    <AnimatedPressable
                      onPress={() => toggleMember(id)}
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

        {filteredMembers.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="people-outline" size={36} color={Colors.textMuted} />
            <Caption color={Colors.textMuted} style={styles.emptyText}>
              {searchQuery.trim()
                ? 'No users match your search.'
                : 'Start conversations to see contacts here.'}
            </Caption>
          </View>
        ) : (
          <FlashList
            data={filteredMembers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const selected = selectedIds.includes(item.id);
              return (
                <View>
                  <ChatCard
                    variant={selected ? 'tint' : 'surface'}
                    style={[styles.memberRow, selected && styles.memberRowSelected]}
                  >
                    <AnimatedPressable
                      style={styles.memberSelectTap}
                      activeOpacity={0.85}
                      onPress={() => toggleMember(item.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${selected ? 'Deselect' : 'Select'} @${item.username}`}
                      accessibilityHint="Toggles this member for the new group"
                      scaleValue={0.98}
                      hapticFeedback="light"
                    >
                      <View style={styles.memberAvatar}>
                        <Ionicons name="person" size={18} color={Colors.textMuted} />
                      </View>

                      <View style={styles.memberTextWrap}>
                        <BodyEmphasis>@{item.username}</BodyEmphasis>
                        <Caption color={Colors.textSecondary}>Conversation contact</Caption>
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
          title={isCreating ? 'Creating...' : 'Create Group'}
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
    ...Elevation.subtle,
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
    ...Elevation.subtle,
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
    ...Elevation.subtle,
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