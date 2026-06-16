import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography, Elevation } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { AvatarRing } from '../components/chat/AvatarRing';
import { Caption, BodyEmphasis } from '../components/ui/Text';
import { EmptyState } from '../components/EmptyState';

type NavT = StackNavigationProp<RootStackParamList>;

export default function MessageRequestsScreen() {
  const navigation = useNavigation<NavT>();
  const { show } = useToast();
  const haptic = useHaptic();

  const conversations = useStore((state) => state.conversations);
  const messageRequests = useStore((state) => state.messageRequests);
  const acceptMessageRequest = useStore((state) => state.acceptMessageRequest);
  const declineMessageRequest = useStore((state) => state.declineMessageRequest);
  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);
  const currentUser = useStore((state) => state.currentUser);

  const requestConversations = useMemo(() => {
    return conversations.filter((c) => messageRequests.includes(c.id));
  }, [conversations, messageRequests]);

  const handleAccept = (id: string) => {
    haptic.medium();
    acceptMessageRequest(id);
    show('Request accepted', 'success');
  };

  const handleDecline = (id: string) => {
    Alert.alert(
      'Decline request?',
      'This person will not be able to message you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () => {
            haptic.heavy();
            declineMessageRequest(id);
            show('Request declined', 'info');
          },
        },
      ]
    );
  };

  const renderItem = ({ item, index }: { item: typeof requestConversations[0]; index: number }) => {
    const counterpartyId = item.participantIds?.find((id) => id !== 'me' && id !== currentUser?.id);
    const displayTitle = item.title ?? 'Thryft user';
    const avatarUri = item.avatar ?? (counterpartyId ? profileMediaOverrides[counterpartyId]?.avatar ?? undefined : undefined);

    return (
      <Reanimated.View entering={FadeInDown.duration(300).delay(index * 60)}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <AvatarRing
              uri={avatarUri}
              size={52}
              ringWidth={2}
              fallbackInitials={displayTitle.slice(0, 2).toUpperCase()}
            />
            <View style={styles.cardText}>
              <BodyEmphasis numberOfLines={1}>{displayTitle}</BodyEmphasis>
              <Caption color={Colors.textMuted} numberOfLines={2} style={styles.previewText}>
                {item.lastMessage ?? 'Wants to message you'}
              </Caption>
              {item.itemId && (
                <View style={styles.contextPill}>
                  <Ionicons name="pricetag-outline" size={12} color={Colors.brand} />
                  <Caption color={Colors.brand} style={styles.contextPillText}>About a listing</Caption>
                </View>
              )}
            </View>
          </View>

          <View style={styles.actionsRow}>
            <AnimatedPressable
              style={styles.declineBtn}
              onPress={() => handleDecline(item.id)}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="light"
            >
              <Text style={styles.declineText}>Decline</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.acceptBtn}
              onPress={() => handleAccept(item.id)}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="medium"
            >
              <Text style={styles.acceptText}>Accept</Text>
            </AnimatedPressable>
          </View>
        </View>
      </Reanimated.View>
    );
  };

  return (
    <FlagshipScreen header={<FlagshipHeader title="Message Requests" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
      {requestConversations.length === 0 ? (
        <EmptyState
          icon="mail-outline"
          title="No requests"
          subtitle="When someone new messages you, they will appear here."
          ctaLabel="Back to Inbox"
          onCtaPress={() => navigation.goBack()}
        />
      ) : (
        <FlashList
          data={requestConversations}
          keyExtractor={(c) => c.id}
          renderItem={renderItem as any}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xxl,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    marginBottom: Space.sm,
    ...Elevation.subtle,
    gap: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm + 6,
  },
  cardText: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  previewText: {
    lineHeight: Type.caption.lineHeight + 2,
    marginTop: 2,
  },
  contextPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Space.xs,
    alignSelf: 'flex-start',
    backgroundColor: `${Colors.brand}10`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.md,
  },
  contextPillText: {
    fontFamily: Typography.family.semibold,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  declineBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  declineText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  acceptBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: Radius.md,
    backgroundColor: Colors.textPrimary,
  },
  acceptText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.background,
  },
});
