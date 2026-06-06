import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { Space, Radius, Type } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { PremiumToggle } from '../components/PremiumToggle';
import { Typography } from '../theme/designTokens';

type Props = StackScreenProps<RootStackParamList, 'ChatSettings'>;

interface RowDef {
  icon: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  isFirst?: boolean;
  isLast?: boolean;
}

function SettingRow({
  icon,
  title,
  subtitle,
  value,
  onPress,
  toggleValue,
  onToggle,
  isFirst,
  isLast,
}: RowDef) {
  return (
    <AnimatedPressable
      onPress={onPress}
      activeOpacity={0.75}
      scaleValue={0.995}
      hapticFeedback="light"
      disabled={!onPress && !onToggle}
    >
      <View style={[styles.rowRoot, !isLast && styles.rowBorder]}>
        <View style={styles.rowIconWrap}>
          <Ionicons name={icon as any} size={22} color={Colors.textPrimary} />
        </View>
        <View style={styles.rowTextWrap}>
          <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={styles.rowRight}>
          {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
          {onToggle ? (
            <PremiumToggle value={!!toggleValue} onValueChange={onToggle} />
          ) : onPress ? (
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          ) : null}
        </View>
      </View>
    </AnimatedPressable>
  );
}

export default function ChatSettingsScreen({ navigation }: Props) {
  const { show } = useToast();
  const conversations = useStore((s) => s.conversations);
  const mutedIds = useStore((s) => s.mutedConversationIds);
  const archivedIds = useStore((s) => s.archivedConversationIds);
  const readReceipts = useStore((s) => s.readReceiptsEnabled);
  const setReadReceipts = useStore((s) => s.setReadReceiptsEnabled);
  const allowFrom = useStore((s) => s.allowMessagesFrom);
  const setAllowFrom = useStore((s) => s.setAllowMessagesFrom);
  const blockedCount = useStore((s) => s.blockedUsers.length);
  const offersInChat = useStore((s) => s.offersInChatEnabled);
  const setOffersInChat = useStore((s) => s.setOffersInChatEnabled);
  const orderUpdatesInChat = useStore((s) => s.orderUpdatesInChatEnabled);
  const setOrderUpdatesInChat = useStore((s) => s.setOrderUpdatesInChatEnabled);
  const enabledBotIds = useStore((s) => s.enabledBotIds);
  const bots = useStore((s) => s.availableChatBots);
  const messageRequests = useStore((s) => s.messageRequests);

  const mutedCount = mutedIds.length;
  const archivedCount = archivedIds.length;
  const enabledBots = bots.filter((b) => enabledBotIds.includes(b.id));

  const allowLabel: Record<string, string> = {
    everyone: 'Everyone',
    following: 'People I follow',
    nobody: 'No one',
  };

  const handleAllowPress = () => {
    Alert.alert(
      'Who can message me',
      'Choose who can start conversations with you.',
      [
        { text: 'Everyone', onPress: () => setAllowFrom('everyone') },
        { text: 'People I follow', onPress: () => setAllowFrom('following') },
        { text: 'No one', onPress: () => setAllowFrom('nobody') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleClearArchived = () => {
    Alert.alert(
      'Clear archived chats?',
      'This will remove all chats from your archive list locally.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            show('Archived chats cleared locally', 'success');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      <View style={styles.header}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={styles.headerBack}
          scaleValue={0.92}
          hapticFeedback="light"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Chat Settings</Text>
        <View style={styles.headerBack} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Privacy */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
          <Text style={styles.sectionLabel}>Privacy</Text>
          <View style={styles.rowGroup}>
            <SettingRow
              icon="lock-closed-outline"
              title="Who can message me"
              value={allowLabel[allowFrom]}
              onPress={handleAllowPress}
              isFirst
            />
            <SettingRow
              icon="eye-outline"
              title="Read receipts"
              subtitle="Let others know when you’ve seen their messages"
              toggleValue={readReceipts}
              onToggle={setReadReceipts}
            />
            <SettingRow
              icon="people-circle-outline"
              title="Blocked users"
              value={blockedCount > 0 ? `${blockedCount}` : 'None'}
              onPress={() => navigation.navigate('BlockedUsers')}
              isLast
            />
          </View>
        </Reanimated.View>

        {/* Conversations */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(60)}>
          <Text style={styles.sectionLabel}>Conversations</Text>
          <View style={styles.rowGroup}>
            <SettingRow
              icon="volume-mute-outline"
              title="Muted conversations"
              value={mutedCount > 0 ? `${mutedCount}` : 'None'}
              onPress={() => {
                if (mutedCount === 0) {
                  show('No muted conversations', 'info');
                  return;
                }
                // Could navigate to a filtered inbox; for now show toast
                show(`${mutedCount} conversation${mutedCount === 1 ? '' : 's'} muted`, 'info');
              }}
              isFirst
            />
            <SettingRow
              icon="archive-outline"
              title="Archived conversations"
              value={archivedCount > 0 ? `${archivedCount}` : 'None'}
              onPress={() => {
                if (archivedCount === 0) {
                  show('No archived conversations', 'info');
                  return;
                }
                show(`${archivedCount} conversation${archivedCount === 1 ? '' : 's'} archived`, 'info');
              }}
            />
            <SettingRow
              icon="trash-outline"
              title="Clear archived chats"
              subtitle="Remove all archived conversations from this list"
              onPress={handleClearArchived}
              isLast
            />
          </View>
        </Reanimated.View>

        {/* Marketplace chat */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(90)}>
          <Text style={styles.sectionLabel}>Marketplace Chat</Text>
          <View style={styles.rowGroup}>
            <SettingRow
              icon="pricetag-outline"
              title="Offers in chat"
              subtitle="Show offer cards inside transaction conversations"
              toggleValue={offersInChat}
              onToggle={setOffersInChat}
              isFirst
            />
            <SettingRow
              icon="cube-outline"
              title="Order updates in chat"
              subtitle="Display shipping and delivery status cards"
              toggleValue={orderUpdatesInChat}
              onToggle={setOrderUpdatesInChat}
            />
            <SettingRow
              icon="shield-checkmark-outline"
              title="Transaction safety notes"
              subtitle="Tips on staying safe during marketplace deals"
              onPress={() => navigation.navigate('HelpSupport')}
              isLast
            />
          </View>
        </Reanimated.View>

        {/* Bots */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(120)}>
          <Text style={styles.sectionLabel}>Bots & Automation</Text>
          <View style={styles.rowGroup}>
            <SettingRow
              icon="hardware-chip-outline"
              title="Bot directory"
              subtitle="Browse and manage marketplace bots"
              onPress={() => navigation.navigate('BotDirectory')}
              isFirst
            />
            <SettingRow
              icon="toggle-outline"
              title="Enabled bots"
              value={enabledBots.length > 0 ? `${enabledBots.length}` : 'None'}
              onPress={() => {
                if (enabledBots.length === 0) {
                  show('No bots enabled. Visit Bot Directory to enable one.', 'info');
                  return;
                }
                navigation.navigate('BotDirectory');
              }}
            />
            <SettingRow
              icon="lock-closed-outline"
              title="Bot permissions"
              subtitle="Review what data each bot can access"
              onPress={() => navigation.navigate('BotDirectory')}
              isLast
            />
          </View>
        </Reanimated.View>

        {/* Message requests */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(150)}>
          <Text style={styles.sectionLabel}>Message Requests</Text>
          <View style={styles.rowGroup}>
            <SettingRow
              icon="mail-unread-outline"
              title="Pending requests"
              value={messageRequests.length > 0 ? `${messageRequests.length}` : 'None'}
              onPress={() => {
                if (messageRequests.length === 0) {
                  show('No pending message requests', 'info');
                  return;
                }
                navigation.navigate('MainTabs', { screen: 'Inbox' } as any);
              }}
              isFirst
              isLast
            />
          </View>
        </Reanimated.View>

        {/* Notifications */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(180)}>
          <Text style={styles.sectionLabel}>Notifications</Text>
          <View style={styles.rowGroup}>
            <SettingRow
              icon="notifications-outline"
              title="Chat notifications"
              subtitle="Customise push and in-app alerts for messages"
              onPress={() => navigation.navigate('PushNotifications')}
              isFirst
              isLast
            />
          </View>
        </Reanimated.View>

        <View style={{ height: Space.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 4,
  },
  headerBack: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
  },
  sectionLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Space.sm + 4,
    marginTop: Space.lg,
    letterSpacing: Type.body.letterSpacing,
  },
  rowGroup: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Space.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  rowRoot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Space.md,
    minHeight: 56,
    gap: Space.sm + 4,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowIconWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
  },
  rowSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  rowValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    maxWidth: 140,
    letterSpacing: Type.body.letterSpacing,
  },
});
