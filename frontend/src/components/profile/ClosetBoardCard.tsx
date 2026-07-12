import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import { Listing } from '../../data/mockData';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - Space.md * 2 - Space.sm) / 2;
const COVER_SIZE = (CARD_W - 6) / 2;

interface ClosetBoardCardProps {
  title: string;
  itemCount: number;
  covers: string[];
  onPress: () => void;
  index?: number;
}

export function ClosetBoardCard({
  title,
  itemCount,
  covers,
  onPress,
  index = 0,
}: ClosetBoardCardProps) {
  const hasCovers = covers.length > 0;
  const reducedMotionEnabled = useReducedMotion();

  return (
    <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(240).delay(Math.min(index, 6) * 40)}>
      <AnimatedPressable
        style={styles.card}
        onPress={onPress}
        {...PressPresets.card}
        accessibilityRole="button"
        accessibilityLabel={`${title} board, ${itemCount} items`}
      >
        {/* Moodboard collage */}
        <View style={styles.collage}>
          {hasCovers ? (
            <>
              {/* Main large tile */}
              <View style={styles.mainTile}>
                <CachedImage
                  uri={covers[0]}
                  style={styles.coverImg}
                  contentFit="cover"
                  emptyLabel={title}
                  emptyIcon="image-outline"
                />
                {covers.length > 1 && (
                  <View style={styles.miniGrid}>
                    <View style={styles.miniTile}>
                      <CachedImage
                        uri={covers[1]}
                        style={styles.coverImg}
                        contentFit="cover"
                        emptyIcon="image-outline"
                      />
                    </View>
                    {covers.length > 2 && (
                      <View style={styles.miniTile}>
                        <CachedImage
                          uri={covers[2]}
                          style={styles.coverImg}
                          contentFit="cover"
                          emptyIcon="image-outline"
                        />
                      </View>
                    )}
                    {covers.length === 2 && (
                      <View style={[styles.miniTile, styles.emptyMini]}>
                        <Ionicons name="add" size={16} color={Colors.textMuted} />
                      </View>
                    )}
                  </View>
                )}
              </View>
            </>
          ) : (
            <View style={styles.emptyCollage}>
              <Ionicons name="folder-open-outline" size={28} color={Colors.textMuted} />
            </View>
          )}
        </View>

        {/* Bottom gradient for text legibility */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Title overlay at bottom */}
        <View style={styles.textOverlay}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.meta}>{itemCount} {itemCount === 1 ? 'item' : 'items'}</Text>
        </View>
      </AnimatedPressable>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_W * 1.15,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
    position: 'relative',
  },
  collage: {
    width: '100%',
    height: '100%',
  },
  mainTile: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  coverImg: {
    width: '100%',
    height: '100%',
  },
  miniGrid: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: COVER_SIZE * 1.2,
    height: COVER_SIZE * 1.2,
    gap: 3,
  },
  miniTile: {
    flex: 1,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  emptyMini: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  emptyCollage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    paddingTop: 24,
  },
  title: {
    fontFamily: Typography.family.bold,
    fontSize: 14,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  meta: {
    fontFamily: Typography.family.medium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});