import React, { useState } from 'react';
import { View } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { BottomSheetPicker } from '../components/BottomSheetPicker';

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
    setAllowFrom(key as any);
    setShowAllowSheet(false);
  };

  return (
    <FlagshipScreen header={<FlagshipHeader title="Chat settings" onBack={() => navigation.goBack()} />}>
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
