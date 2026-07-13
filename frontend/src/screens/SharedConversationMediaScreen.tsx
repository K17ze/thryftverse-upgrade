import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { Colors } from '../constants/colors';
import { Space, Radius } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { isVideoUri } from '../utils/media';
import { useHaptic } from '../hooks/useHaptic';
import { EmptyState } from '../components/EmptyState';

type Props = StackScreenProps<RootStackParamList, 'SharedConversationMedia'>;

const GAP = 2;
const COLS = 3;

type MediaItem = {
  id: string;
  mediaUri: string;
  isVideo: boolean;
  senderLabel: string;
  timestamp?: string;
};

export default function SharedConversationMediaScreen({ navigation, route }: Props) {
  const { conversationId } = route.params as { conversationId: string };
  const haptic = useHaptic();
  const { width } = useWindowDimensions();
  const thumbSize = (width - Space.md * 2 - GAP * (COLS - 1)) / COLS;

  const conversations = useStore((state) => state.conversations);
  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  const mediaItems = useMemo<MediaItem[]>(() => {
    if (!conversation?.messages?.length) return [];
    return conversation.messages
      .filter((m) => m.mediaUri)
      .map((m) => ({
        id: m.id,
        mediaUri: m.mediaUri!,
        isVideo: m.mediaType === 'video' || isVideoUri(m.mediaUri!),
        senderLabel: m.senderId === 'me' ? 'You' : 'Thryft user',
        timestamp: m.timestamp,
      }));
  }, [conversation]);

  const handlePress = (item: MediaItem) => {
    haptic.light();
    navigation.navigate('ChatMediaPreview', {
      mediaUri: item.mediaUri,
      mediaType: item.isVideo ? 'video' : 'image',
      senderLabel: item.senderLabel,
      timestamp: item.timestamp,
    });
  };

  const renderItem = ({ item }: { item: MediaItem }) => (
    <AnimatedPressable
      style={[styles.thumbWrap, { width: thumbSize, height: thumbSize }]}
      onPress={() => handlePress(item)}
      activeOpacity={0.85}
      scaleValue={0.96}
      hapticFeedback="light"
      accessibilityLabel={item.isVideo ? 'View shared video' : 'View shared photo'}
      accessibilityRole="button"
    >
      {item.isVideo ? (
        <View style={[styles.thumb, styles.videoTile, { width: thumbSize, height: thumbSize }]}>
          <Ionicons name="videocam" size={24} color={Colors.textSecondary} />
        </View>
      ) : (
        <CachedImage
          uri={item.mediaUri}
          style={[styles.thumb, { width: thumbSize, height: thumbSize }]}
          contentFit="cover"
        />
      )}
      {item.isVideo && (
        <View style={styles.videoBadge}>
          <Ionicons name="play" size={12} color={Colors.textInverse} />
        </View>
      )}
    </AnimatedPressable>
  );

  return (
    <FlagshipScreen
      header={(
        <FlagshipHeader
          title="Shared Media"
          subtitle={mediaItems.length > 0 ? `${mediaItems.length} photo${mediaItems.length === 1 ? '' : 's'} & video${mediaItems.length === 1 ? '' : 's'}` : undefined}
          onBack={() => navigation.goBack()}
        />
      )}
      scrollEnabled={false}
    >
      {mediaItems.length === 0 ? (
        <EmptyState
          icon="images-outline"
          title="No shared media"
          subtitle="Photos and videos shared in this conversation will appear here."
          ctaLabel="Back"
          onCtaPress={() => navigation.goBack()}
        />
      ) : (
        <FlashList
          data={mediaItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={COLS}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xxl,
  },
  thumbWrap: {
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
    marginRight: GAP,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  thumb: {
    borderRadius: Radius.sm,
  },
  videoTile: {
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
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
});
