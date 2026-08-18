import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke } from '../theme/designTokens';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatSettings'>;

export default function ChatSettingsScreen({ navigation }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const customAgents = useStore((s) => s.customBots);
  const messageRequests = useStore((s) => s.messageRequests);

  const [showAllowSheet, setShowAllowSheet] = useState(false);

  const mutedCount = mutedIds.length;
  const archivedCount = archivedIds.length;
  const publishedAgentCount = customAgents.filter((agent) => !agent.isDraft && !agent.isDisabled).length;

  const allowOptions = ['Everyone', 'People I follow', 'No one'];
  const allowLabel: Record<string, string> = {
    everyone: 'Everyone',
    following: 'People I follow',
    nobody: 'No one',
  };

  const handleAllowSelect = (value: string) => {
    const key = value === 'Everyone' ? 'everyone' : value === 'People I follow' ? 'following' : 'nobody';
    setAllowFrom(key);
    setShowAllowSheet(false);
  };

  return (
    <FlagshipScreen header={<FlagshipHeader title="Chat settings" onBack={() => navigation.goBack()} />}>
      {/* Hero summary */}
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
              <Ionicons name="chatbubble-ellipses" size={20} color={colors.textInverse} />
            </View>
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Messaging</Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                {allowLabel[allowFrom]} can message you
              </Text>
            </View>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatValue, { color: colors.textPrimary }]}>{mutedCount}</Text>
              <Text style={[styles.heroStatLabel, { color: colors.textMuted }]}>Muted</Text>
            </View>
            <View style={[styles.heroStatDivider, { backgroundColor: colors.borderSubtle }]} />
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatValue, { color: colors.textPrimary }]}>{archivedCount}</Text>
              <Text style={[styles.heroStatLabel, { color: colors.textMuted }]}>Archived</Text>
            </View>
            <View style={[styles.heroStatDivider, { backgroundColor: colors.borderSubtle }]} />
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatValue, { color: colors.textPrimary }]}>{blockedCount}</Text>
              <Text style={[styles.heroStatLabel, { color: colors.textMuted }]}>Blocked</Text>
            </View>
          </View>
        </View>

      <SettingsSection title="Who can reach you" noCard>
        <SettingsRow
          title="Who can message me"
          value={allowLabel[allowFrom]}
          onPress={() => setShowAllowSheet(true)}
          isFirst
        />
        <SettingsRow
          title="Read receipts"
          subtitle="Let others know when you've seen their messages"
          toggleValue={readReceipts}
          onToggle={setReadReceipts}
        />
        <SettingsRow
          title="Blocked users"
          subtitle={blockedCount > 0 ? `${blockedCount} blocked` : 'None blocked'}
          onPress={() => navigation.navigate('BlockedUsers')}
          isLast
        />
      </SettingsSection>

      <SettingsSection title="Conversations" noCard>
        <SettingsRow
          title="Muted conversations"
          subtitle={mutedCount > 0 ? `${mutedCount} muted` : 'None muted'}
          onPress={() => navigation.navigate('MutedConversations')}
          isFirst
        />
        <SettingsRow
          title="Archived conversations"
          subtitle={archivedCount > 0 ? `${archivedCount} archived` : 'None archived'}
          onPress={() => navigation.navigate('ArchivedConversations')}
          isLast
        />
      </SettingsSection>

      <SettingsSection title="Agents & automation" noCard>
        <SettingsRow
          title="Your agents"
          subtitle={publishedAgentCount > 0 ? `${publishedAgentCount} published` : 'Create and tune a private AI agent'}
          onPress={() => navigation.navigate('CustomBots')}
          isFirst
        />
        <SettingsRow
          title="Agent library"
          subtitle="Explore specialists for group conversations"
          onPress={() => navigation.navigate('BotDirectory')}
          isLast
        />
      </SettingsSection>

      <SettingsSection title="Marketplace" noCard>
        <SettingsRow
          title="Offers in chat"
          subtitle="Show offer cards inside transaction conversations"
          toggleValue={offersInChat}
          onToggle={setOffersInChat}
          isFirst
        />
        <SettingsRow
          title="Order updates in chat"
          subtitle="Display shipping and delivery status cards"
          toggleValue={orderUpdatesInChat}
          onToggle={setOrderUpdatesInChat}
        />
        <SettingsRow
          title="Transaction safety notes"
          subtitle="Tips on staying safe during marketplace deals"
          onPress={() => navigation.navigate('HelpSupport')}
          isLast
        />
      </SettingsSection>

      <SettingsSection title="Message requests" noCard>
        <SettingsRow
          title="Pending requests"
          subtitle={messageRequests.length > 0 ? `${messageRequests.length} pending` : 'None pending'}
          onPress={() => {
            if (messageRequests.length === 0) {
              show('No pending message requests', 'info');
              return;
            }
            navigation.navigate('MessageRequests');
          }}
          isFirst
          isLast
        />
      </SettingsSection>

      <SettingsSection title="Quick replies" noCard>
        <SettingsRow
          title="Manage quick replies"
          subtitle="Save time with reusable message templates"
          onPress={() => navigation.navigate('ManageQuickReplies', { role: 'buyer' })}
          isFirst
          isLast
        />
      </SettingsSection>

      <SettingsSection title="Notifications" noCard>
        <SettingsRow
          title="Chat notifications"
          subtitle="Customise push and in-app alerts for messages"
          onPress={() => navigation.navigate('PushNotifications')}
          isFirst
          isLast
        />
      </SettingsSection>

      <BottomSheetPicker
        visible={showAllowSheet}
        onClose={() => setShowAllowSheet(false)}
        title="Who can message me"
        options={allowOptions}
        selectedValue={allowLabel[allowFrom]}
        onSelect={handleAllowSelect}
      />
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    heroCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      marginBottom: Space.md,
      gap: Space.md,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
    },
    heroIcon: {
      width: Space.xl + Space.sm,
      height: Space.xl + Space.sm,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroText: { flex: 1 },
    heroTitle: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    heroSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs / 2,
    },
    heroStats: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    heroStat: { flex: 1, alignItems: 'center' },
    heroStatValue: {
      fontSize: Type.priceList.size,
      fontFamily: Typography.family.bold,
      fontVariant: ['tabular-nums'],
    },
    heroStatLabel: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      marginTop: Space.xs / 2,
    },
    heroStatDivider: {
      width: Stroke.standard,
      height: Space.lg + Space.xs,
    },
  });
}
