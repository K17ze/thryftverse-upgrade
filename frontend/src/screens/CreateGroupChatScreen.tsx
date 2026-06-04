import React, { useMemo, useState } from 'react';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { ActiveTheme, Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { CachedImage } from '../components/CachedImage';
import { createGroupConversationOnApi } from '../services/chatApi';
import { parseApiError } from '../lib/apiClient';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppInput } from '../components/ui/AppInput';
import { AppButton } from '../components/ui/AppButton';
import { ChatCard } from '../components/chat/ChatCard';
import { Space, Radius, Type } from '../theme/designTokens';
import { Meta, Caption, BodyEmphasis } from '../components/ui/Text';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { Motion } from '../constants/motion';

type Props = StackScreenProps<RootStackParamList, 'CreateGroupChat'>;

export default function CreateGroupChatScreen({ navigation }: Props) {
  const currentUser = useStore((state) => state.currentUser);
  const createGroupConversation = useStore((state) => state.createGroupConversation);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const { show } = useToast();
  const haptic = useHaptic();
  const reducedMotionEnabled = useReducedMotion();

  const [title, setTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
    setSelectedIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    );
  };

  const handleCreateGroup = async () => {
    const groupTitle = title.trim();
    if (!groupTitle) {
      show('Add a group title to continue.', 'error');
      return;
    }

    setIsCreating(true);

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      <ScreenHeader
        title="Create Group Chat"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.body}>
        <ChatCard variant="surface" style={styles.titleCard}>
          <Meta color={Colors.textMuted} style={styles.label}>Group title</Meta>
          <AppInput
            value={title}
            onChangeText={setTitle}
            placeholder="Example: Thryft Snipers"
            placeholderTextColor={Colors.textMuted}
            maxLength={40}
            inputContainerStyle={styles.inputWrap}
            inputStyle={styles.input}
            accessibilityLabel="Group title input"
            accessibilityHint="Enter a name for the new group chat"
          />
        </ChatCard>

        <View style={styles.sectionRow}>
          <BodyEmphasis>Members (optional)</BodyEmphasis>
          <Caption color={Colors.textMuted}>{selectedIds.length} selected</Caption>
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

        <FlashList
          data={filteredMembers}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => {
            const selected = selectedIds.includes(item.id);
            return (
              <Reanimated.View
                entering={
                  reducedMotionEnabled
                    ? undefined
                    : FadeInDown
                      .delay(Math.min(index, Motion.list.maxStaggerItems) * Motion.list.staggerStep)
                      .duration(Motion.list.enterDuration)
                }
              >
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
              </Reanimated.View>
            );
          }}
          contentContainerStyle={styles.memberList}
          ItemSeparatorComponent={() => <View style={{ height: Space.sm + 2 }} />}
          showsVerticalScrollIndicator={false}
        />

        <AppButton
          style={[styles.createBtn, (!title.trim() || isCreating) && styles.createBtnDisabled]}
          variant="primary"
          size="md"
          align="center"
          title={isCreating ? 'Creating...' : 'Create Group'}
          onPress={() => {
            void handleCreateGroup();
          }}
          disabled={!title.trim() || isCreating}
          accessibilityLabel={isCreating ? 'Creating group chat' : 'Create group chat'}
          accessibilityRole="button"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
});
