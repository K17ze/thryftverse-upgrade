import React from 'react';
import { Alert, View } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SettingsPage } from '../components/settings/SettingsPage';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';

type Props = StackScreenProps<RootStackParamList, 'ChatSettings'>;

export default function ChatSettingsScreenV2({ navigation }: Props) {
  const { show } = useToast();
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
  const reducedMotionEnabled = useReducedMotion();

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
    <SettingsPage title="Chat Settings" onBack={() => navigation.goBack()}>
      {/* Privacy */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(0)}>
        <SettingsSection title="Privacy">
          <SettingsRow
            icon="lock-closed-outline"
            title="Who can message me"
            value={allowLabel[allowFrom]}
            onPress={handleAllowPress}
            isFirst
          />
          <SettingsRow
            icon="eye-outline"
            title="Read receipts"
            subtitle="Let others know when you’ve seen their messages"
            toggleValue={readReceipts}
            onToggle={setReadReceipts}
          />
          <SettingsRow
            icon="people-circle-outline"
            title="Blocked users"
            value={blockedCount > 0 ? `${blockedCount}` : 'None'}
            onPress={() => navigation.navigate('BlockedUsers')}
            isLast
          />
        </SettingsSection>
      </Reanimated.View>

      {/* Conversations */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(60)}>
        <SettingsSection title="Conversations">
          <SettingsRow
            icon="volume-mute-outline"
            title="Muted conversations"
            value={mutedCount > 0 ? `${mutedCount}` : 'None'}
            onPress={() => {
              if (mutedCount === 0) { show('No muted conversations', 'info'); return; }
              show(`${mutedCount} conversation${mutedCount === 1 ? '' : 's'} muted`, 'info');
            }}
            isFirst
          />
          <SettingsRow
            icon="archive-outline"
            title="Archived conversations"
            value={archivedCount > 0 ? `${archivedCount}` : 'None'}
            onPress={() => {
              if (archivedCount === 0) { show('No archived conversations', 'info'); return; }
              show(`${archivedCount} conversation${archivedCount === 1 ? '' : 's'} archived`, 'info');
            }}
          />
          <SettingsRow
            icon="trash-outline"
            title="Clear archived chats"
            subtitle="Remove all archived conversations from this list"
            onPress={handleClearArchived}
            isLast
          />
        </SettingsSection>
      </Reanimated.View>

      {/* Marketplace chat */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)}>
        <SettingsSection title="Marketplace Chat">
          <SettingsRow
            icon="pricetag-outline"
            title="Offers in chat"
            subtitle="Show offer cards inside transaction conversations"
            toggleValue={offersInChat}
            onToggle={setOffersInChat}
            isFirst
          />
          <SettingsRow
            icon="cube-outline"
            title="Order updates in chat"
            subtitle="Display shipping and delivery status cards"
            toggleValue={orderUpdatesInChat}
            onToggle={setOrderUpdatesInChat}
          />
          <SettingsRow
            icon="shield-checkmark-outline"
            title="Transaction safety notes"
            subtitle="Tips on staying safe during marketplace deals"
            onPress={() => navigation.navigate('HelpSupport')}
            isLast
          />
        </SettingsSection>
      </Reanimated.View>

      {/* Bots */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(180)}>
        <SettingsSection title="Bots & Automation">
          <SettingsRow
            icon="hardware-chip-outline"
            title="Bot directory"
            subtitle="Browse and manage marketplace bots"
            onPress={() => navigation.navigate('BotDirectory')}
            isFirst
          />
          <SettingsRow
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
          <SettingsRow
            icon="lock-closed-outline"
            title="Bot permissions"
            subtitle="Review what data each bot can access"
            onPress={() => navigation.navigate('BotDirectory')}
            isLast
          />
        </SettingsSection>
      </Reanimated.View>

      {/* Message requests */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(240)}>
        <SettingsSection title="Message Requests">
          <SettingsRow
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
        </SettingsSection>
      </Reanimated.View>

      {/* Notifications */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(300)}>
        <SettingsSection title="Notifications">
          <SettingsRow
            icon="notifications-outline"
            title="Chat notifications"
            subtitle="Customise push and in-app alerts for messages"
            onPress={() => navigation.navigate('PushNotifications')}
            isFirst
            isLast
          />
        </SettingsSection>
      </Reanimated.View>
    </SettingsPage>
  );
}
