import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, TypeStyles } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { CachedImage } from '../components/CachedImage';
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = StackScreenProps<RootStackParamList, 'ConversationInfo'>;

export default function ConversationInfoScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { show } = useToast();
  const haptic = useHaptic();

  const conversations = useStore((state) => state.conversations);
  const deleteConversation = useStore((state) => state.deleteConversation);
  const archiveConversation = useStore((state) => state.archiveConversation);
  const mutedIds = useStore((state) => state.mutedConversationIds);
  const toggleMuted = useStore((state) => state.toggleMutedConversation);
  const blockedUsers = useStore((state) => state.blockedUsers);
  const toggleBlockedUser = useStore((state) => state.toggleBlockedUser);
  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);
  const participantNameLookup = useStore((state) => (state as any).participantNameLookup as Map<string, string> | undefined);

  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  const isMuted = mutedIds.includes(conversationId);
  const counterpartyId = conversation?.participantIds?.find(
    (id) => id !== 'me'
  );
  const isBlocked = counterpartyId ? blockedUsers.includes(counterpartyId) : false;

  if (!conversation) {
    return (
      <SafeAreaView edges={['top']} style={styles.screenRoot}>
        <View style={styles.compactHeader}>
          <AnimatedPressable
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            scaleValue={0.92}
            hapticFeedback="light"
            accessibilityLabel="Go back"
            accessibilityRole="button"
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.headerTitle}>Conversation</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.center}>
          <Caption color={Colors.textMuted}>Conversation not found</Caption>
        </View>
      </SafeAreaView>
    );
  }

  const handleDelete = () => {
    Alert.alert(
      'Delete for me?',
      'This removes the conversation from your inbox on this device. The other participant keeps their copy.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete for me',
          style: 'destructive',
          onPress: () => {
            haptic.heavy();
            deleteConversation(conversationId);
            show('Conversation removed from your inbox', 'info');
            navigation.navigate('MainTabs', { screen: 'Inbox' });
          },
        },
      ]
    );
  };

  const handleArchive = () => {
    haptic.medium();
    archiveConversation(conversationId);
    show('Conversation archived', 'success');
    navigation.navigate('MainTabs', { screen: 'Inbox' });
  };

  const handleToggleMute = () => {
    haptic.light();
    toggleMuted(conversationId);
    show(isMuted ? 'Conversation unmuted' : 'Conversation muted', 'success');
  };

  const handleToggleBlock = () => {
    if (!counterpartyId) return;
    haptic.heavy();
    toggleBlockedUser(counterpartyId);
    show(isBlocked ? 'User unblocked' : 'User blocked', isBlocked ? 'success' : 'info');
  };

  const handleViewProfile = () => {
    if (counterpartyId) {
      navigation.navigate('UserProfile', { userId: counterpartyId });
    }
  };

  const displayName =
    (counterpartyId ? participantNameLookup?.get(counterpartyId) : undefined) ??
    conversation.title ??
    'Thryft user';
  const avatarUrl =
    conversation.avatar ??
    (counterpartyId ? profileMediaOverrides[counterpartyId]?.avatar ?? null : null);
  const handle = counterpartyId ? `@${counterpartyId.slice(0, 12)}` : 'Direct message';

  return (
    <SafeAreaView edges={['top']} style={styles.screenRoot}>
      <View style={styles.compactHeader}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          scaleValue={0.92}
          hapticFeedback="light"
          accessibilityLabel="Go back"
          accessibilityRole="button"
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Conversation Info</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Partner Identity */}
        <View>
          <AnimatedPressable
            style={styles.identityCardV2}
            onPress={handleViewProfile}
            disabled={!counterpartyId}
            activeOpacity={0.85}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={`View ${displayName}'s profile`}
          >
            <View style={styles.identityAvatarWrap}>
              {avatarUrl ? (
                <CachedImage uri={avatarUrl} style={styles.identityAvatarImage} contentFit="cover" />
              ) : (
                <View style={[styles.identityAvatarFallback, { backgroundColor: Colors.surfaceAlt }]}>
                  <Text style={styles.identityAvatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>
            <BodyEmphasis style={styles.identityName} numberOfLines={1}>{displayName}</BodyEmphasis>
            <Caption color={Colors.textMuted}>{handle}</Caption>
          </AnimatedPressable>
        </View>

        {/* Profile */}
        <View>
          <Section title="Profile">
            <RowItem
              icon="person-outline"
              label="View profile"
              onPress={handleViewProfile}
              showChevron
            />
          </Section>
        </View>

        {/* Media & shared */}
        <View>
          <Section title="Media & shared">
            <RowItem
              icon="images-outline"
              label="Photos & videos"
              onPress={() => navigation.navigate('SharedConversationMedia', { conversationId })}
              showChevron
              detail={(() => {
                const count = conversation.messages?.filter((m) => m.mediaUri).length ?? 0;
                return count > 0 ? `${count}` : undefined;
              })()}
            />
          </Section>
        </View>

        {/* Marketplace context */}
        {conversation.itemId && (
          <View>
            <Section title="Context">
              <RowItem
                icon="pricetag-outline"
                label="View linked listing"
                onPress={() => {
                if (conversation.itemId) {
                  navigation.navigate('ItemDetail', { itemId: conversation.itemId });
                }
              }}
                showChevron
              />
            </Section>
          </View>
        )}

        {/* Actions */}
        <View>
          <Section title="Actions">
            <RowItem
              icon={isMuted ? 'volume-mute-outline' : 'volume-high-outline'}
              label={isMuted ? 'Unmute notifications' : 'Mute notifications'}
              onPress={handleToggleMute}
            />
            <RowItem
              icon="archive-outline"
              label="Archive chat"
              onPress={handleArchive}
            />
          </Section>
        </View>

        {/* Danger zone */}
        <View>
          <Section title="Danger zone" danger>
            <RowItem
              icon={isBlocked ? 'person-add-outline' : 'person-remove-outline'}
              label={isBlocked ? 'Unblock user' : 'Block user'}
              onPress={handleToggleBlock}
              danger={!isBlocked}
            />
            <RowItem
              icon="trash-outline"
              label="Delete for me"
              onPress={handleDelete}
              danger
            />
          </Section>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children, danger }: { title: string; children: React.ReactNode; danger?: boolean }) {
  const childArray = React.Children.toArray(children);
  const lastIndex = childArray.length - 1;
  const childrenWithIsLast = childArray.map((child, index) => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, { isLast: index === lastIndex } as any);
    }
    return child;
  });
  return (
    <View style={styles.section}>
      <Meta color={danger ? Colors.danger : Colors.textMuted} style={styles.sectionLabel}>
        {title.toUpperCase()}
      </Meta>
      <View style={[styles.sectionCard, danger && styles.sectionCardDanger]}>{childrenWithIsLast}</View>
    </View>
  );
}

function RowItem({
  icon,
  label,
  onPress,
  showChevron,
  danger,
  isLast,
  detail,
}: {
  icon: string;
  label: string;
  onPress?: () => void;
  showChevron?: boolean;
  danger?: boolean;
  isLast?: boolean;
  detail?: string;
}) {
  const content = (
    <View style={[styles.row, !isLast && styles.rowBorder]}>
      <Ionicons
        name={icon as any}
        size={20}
        color={danger ? Colors.danger : Colors.textSecondary}
      />
      <Text
        style={[
          styles.rowLabel,
          { color: danger ? Colors.danger : Colors.textPrimary },
        ]}
      >
        {label}
      </Text>
      {detail && (
        <Caption color={Colors.textMuted}>{detail}</Caption>
      )}
      {showChevron && (
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      )}
    </View>
  );

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        activeOpacity={0.7}
        scaleValue={0.98}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {content}
      </AnimatedPressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: Type.title.size,
    fontFamily: TypeStyles.title.fontFamily,
    color: Colors.textPrimary,
    letterSpacing: Type.title.letterSpacing,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
    gap: Space.lg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  identityCard: {
    alignItems: 'center',
    paddingVertical: Space.lg,
    gap: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    marginHorizontal: Space.xs,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: Colors.border,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 76,
    height: 76,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
  },
  avatarText: {
    fontSize: 28,
    fontFamily: TypeStyles.title.fontFamily,
    color: Colors.textPrimary,
    textTransform: 'uppercase',
  },
  name: {
    fontSize: Type.subtitle.size,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  identityCardV2: {
    alignItems: 'center',
    paddingVertical: Space.lg + 8,
    gap: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    marginHorizontal: Space.xs,
  },
  identityAvatarWrap: {
    width: 96,
    height: 96,
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginBottom: Space.xs,
  },
  identityAvatarImage: {
    width: 96,
    height: 96,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
  },
  identityAvatarFallback: {
    width: 96,
    height: 96,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  identityAvatarText: {
    fontSize: 32,
    fontFamily: TypeStyles.title.fontFamily,
    color: Colors.textPrimary,
    textTransform: 'uppercase',
  },
  identityName: {
    fontSize: Type.subtitle.size,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  section: {
    gap: Space.sm,
  },
  sectionLabel: {
    marginLeft: Space.sm,
    letterSpacing: 1.2,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  sectionCardDanger: {
    borderColor: `${Colors.danger}30`,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Space.md,
    gap: Space.sm + 4,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowLabel: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
  },
});