import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { Caption } from '../ui/Text';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const { width: SCREEN_W } = Dimensions.get('window');
const MAX_MEDIA_W = SCREEN_W * 0.68;

interface MediaMessageBubbleProps {
  uri: string;
  isMe: boolean;
  timestamp?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: object;
}

export function MediaMessageBubble({
  uri,
  isMe,
  timestamp,
  onPress,
  onLongPress,
  style,
}: MediaMessageBubbleProps) {
  const reducedMotion = useReducedMotion();

  return (
    <Reanimated.View
      entering={reducedMotion ? undefined : FadeIn.duration(220)}
      style={[styles.container, isMe && styles.containerRight, style]}
    >
      <AnimatedPressable
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.9}
        scaleValue={0.98}
        hapticFeedback="light"
        accessibilityRole="imagebutton"
        accessibilityLabel="Media message"
      >
        <View style={[styles.mediaWrap, isMe ? styles.mediaMe : styles.mediaThem]}>
          <CachedImage
            uri={uri}
            style={styles.image}
            contentFit="cover"
          />
          <View style={styles.overlay}>
            {timestamp ? (
              <Caption color={Colors.textInverse} style={styles.timestamp}>
                {timestamp}
              </Caption>
            ) : null}
          </View>
        </View>
      </AnimatedPressable>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: Space.xs,
    paddingHorizontal: Space.md,
    alignItems: 'flex-end',
  },
  containerRight: {
    justifyContent: 'flex-end',
  },
  mediaWrap: {
    width: MAX_MEDIA_W,
    height: MAX_MEDIA_W * 0.75,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
    position: 'relative',
  },
  mediaMe: {
    borderBottomRightRadius: Radius.sm,
    borderTopRightRadius: Radius.xl,
    borderTopLeftRadius: Radius.xl,
    borderBottomLeftRadius: Radius.xl,
  },
  mediaThem: {
    borderBottomLeftRadius: Radius.sm,
    borderTopRightRadius: Radius.xl,
    borderTopLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Space.sm + 4,
    paddingVertical: Space.sm,
    backgroundColor: 'rgba(0,0,0,0.35)',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  timestamp: {
    fontSize: 10,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
