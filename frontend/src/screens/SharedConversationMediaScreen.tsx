import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { useHaptic } from '../hooks/useHaptic';
import { Caption } from '../components/ui/Text';
import { EmptyState } from '../components/EmptyState';

type Props = StackScreenProps<RootStackParamList, 'SharedConversationMedia'>;

const { width: SCREEN_W } = Dimensions.get('window');
const GAP = 2;
const COLS = 3;
const THUMB_SIZE = (SCREEN_W - Space.md * 2 - GAP * (COLS - 1)) / COLS;

export default function SharedConversationMediaScreen({ navigation, route }: Props) {
  const { conversationId } = route.params as { conversationId: string };
  const haptic = useHaptic();

  const conversations = useStore((state) => state.conversations);
  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  const mediaMessages = useMemo(() => {
    if (!conversation?.messages?.length) return [];
    return conversation.messages.filter((m) => m.mediaUri);
  }, [conversation]);

  const handlePress = (msg: typeof mediaMessages[0]) => {
    haptic.light();
    navigation.navigate('ChatMediaPreview', {
      mediaUri: msg.mediaUri!,
      mediaType: msg.mediaType ?? 'image',
      senderLabel: msg.senderId === 'me' ? 'You' : 'Thryft user',
      timestamp: msg.timestamp,
      messageId: msg.id,
    });
  };

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Shared Media" onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
    >
      {mediaMessages.length === 0 ? (
        <EmptyState
          icon="images-outline"
          title="No shared media"
          subtitle="Photos and videos shared in this conversation will appear here."
          ctaLabel="Back"
          onCtaPress={() => navigation.goBack()}
        />
      ) : (
        <View style={styles.grid}>
          {mediaMessages.map((msg, index) => (
            <AnimatedPressable
              key={msg.id + index}
              style={styles.thumbWrap}
              onPress={() => handlePress(msg)}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="light"
              accessibilityLabel="View media"
              accessibilityRole="button"
            >
              <CachedImage
                uri={msg.mediaUri!}
                style={styles.thumb}
                contentFit="cover"
              />
              {msg.mediaType === 'video' && (
                <View style={styles.videoBadge}>
                  <Caption color={Colors.textInverse} style={styles.videoIcon}>▶</Caption>
                </View>
              )}
            </AnimatedPressable>
          ))}
        </View>
      )}
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    gap: GAP,
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
  },
  videoBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -14,
    marginLeft: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoIcon: {
    fontSize: 10,
    fontFamily: Typography.family.bold,
  },
});
