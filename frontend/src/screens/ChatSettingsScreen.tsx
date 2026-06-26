import React from 'react';
import { Alert, View } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';

type Props = StackScreenProps<RootStackParamList, 'ChatSettings'>;

export default function ChatSettingsScreen({ navigation }: Props) {
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
    <FlagshipScreen header={<FlagshipHeader title="Chat privacy" onBack={() => navigation.goBack()} />}>
      <SettingsSection title="Who can reach you" noCard>
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
          subtitle="Let others know when you've seen their messages"
          toggleValue={readReceipts}
          onToggle={setReadReceipts}
        />
        <SettingsRow
          icon="ban-outline"
          title="Blocked users"
          subtitle={blockedCount > 0 ? `${blockedCount} blocked` : 'None blocked'}
          onPress={() => navigation.navigate('BlockedUsers')}
          isLast
        />
      </SettingsSection>

      <SettingsSection title="Conversations" noCard>
        <SettingsRow
          icon="volume-mute-outline"
          title="Muted conversations"
          subtitle={mutedCount > 0 ? `${mutedCount} muted` : 'None muted'}
          onPress={() => {
            if (mutedCount === 0) { show('No muted conversations', 'info'); return; }
            show(`${mutedCount} conversation${mutedCount === 1 ? '' : 's'} muted`, 'info');
          }}
          isFirst
        />
        <SettingsRow
          icon="archive-outline"
          title="Archived conversations"
          subtitle={archivedCount > 0 ? `${archivedCount} archived` : 'None archived'}
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

      <SettingsSection title="Marketplace" noCard>
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

      <SettingsSection title="Message requests" noCard>
        <SettingsRow
          icon="mail-unread-outline"
          title="Pending requests"
          subtitle={messageRequests.length > 0 ? `${messageRequests.length} pending` : 'None pending'}
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

      <SettingsSection title="Bots & automation" noCard>
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
          subtitle={enabledBots.length > 0 ? `${enabledBots.length} active` : 'None active'}
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

      <SettingsSection title="Notifications" noCard>
        <SettingsRow
          icon="notifications-outline"
          title="Chat notifications"
          subtitle="Customise push and in-app alerts for messages"
          onPress={() => navigation.navigate('PushNotifications')}
          isFirst
          isLast
        />
      </SettingsSection>
    </FlagshipScreen>
  );
}