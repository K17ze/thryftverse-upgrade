import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { Colors } from '../../constants/colors';
import { Typography } from '../../theme/designTokens';

export interface FeaturedBoard {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  images: string[];
  isVerified?: boolean;
  onPress?: () => void;
}

interface Props {
  board: FeaturedBoard;
}

export function FeaturedBoardCard({ board }: Props) {
  const imgs = board.images.slice(0, 3);
  while (imgs.length < 3) {
    imgs.push(`https://picsum.photos/seed/${board.id}${imgs.length}/400/500`);
  }

  return (
    <AnimatedPressable
      style={styles.card}
      onPress={board.onPress}
      activeOpacity={0.92}
      accessibilityLabel={`${board.title} board`}
      accessibilityHint="Opens board details"
    >
      {/* Collage grid */}
      <View style={styles.collage}>
        <CachedImage
          uri={imgs[0]}
          style={styles.mainImage}
          containerStyle={{ borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }}
          contentFit="cover"
        />
        <View style={styles.sideColumn}>
          <CachedImage
            uri={imgs[1]}
            style={styles.sideImage}
            containerStyle={{ borderTopRightRadius: 16 }}
            contentFit="cover"
          />
          <CachedImage
            uri={imgs[2]}
            style={styles.sideImage}
            containerStyle={{ borderBottomRightRadius: 16 }}
            contentFit="cover"
          />
        </View>
      </View>

      {/* Text info */}
      <Text style={styles.title} numberOfLines={1}>{board.title}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.subtitle}>{board.subtitle}</Text>
        {board.isVerified && (
          <Ionicons name="checkmark-circle" size={14} color={Colors.brand} style={{ marginLeft: 4 }} />
        )}
      </View>
      <Text style={styles.meta}>{board.meta}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 260,
    marginRight: 12,
  },
  collage: {
    flexDirection: 'row',
    height: 150,
    borderRadius: 16,
    overflow: 'hidden',
    gap: 3,
    marginBottom: 12,
  },
  mainImage: {
    flex: 3,
    height: '100%',
  },
  sideColumn: {
    flex: 2,
    gap: 3,
  },
  sideImage: {
    flex: 1,
    width: '100%',
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: 15,
    color: Colors.textPrimary,
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: Typography.family.medium,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  meta: {
    fontFamily: Typography.family.medium,
    fontSize: 12,
    color: Colors.textMuted,
  },
});
