import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import type { LookApiItem } from '../../services/looksApi';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_GAP = 8;
const TILE_WIDTH = (SCREEN_W - Space.md * 2 - GRID_GAP) / 2;

type NavT = StackNavigationProp<RootStackParamList>;

export interface ProfileLooksGridProps {
  looks: LookApiItem[];
  isLoading: boolean;
  error: string | null;
  isSelfProfile: boolean;
  onRetry: () => void;
  onCreateLook: () => void;
  navigation: NavT;
}

export function ProfileLooksGrid({
  looks,
  isLoading,
  error,
  isSelfProfile,
  onRetry,
  onCreateLook,
  navigation,
}: ProfileLooksGridProps) {
  if (isLoading && looks.length === 0) {
    return (
      <View style={styles.stateWrap} accessibilityLabel="Loading looks">
        <ActivityIndicator size="large" color={Colors.brand} />
      </View>
    );
  }

  if (error && looks.length === 0) {
    return (
      <View style={styles.stateWrap}>
        <Ionicons name="cloud-offline-outline" size={32} color={Colors.textMuted} />
        <Text style={styles.stateTitle}>Looks could not be loaded</Text>
        <Pressable
          style={styles.retryBtn}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading looks"
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (looks.length === 0 && !error) {
    return (
      <View style={styles.stateWrap}>
        <Ionicons name="camera-outline" size={32} color={Colors.textMuted} />
        <Text style={styles.stateTitle}>No Looks yet</Text>
        {isSelfProfile ? (
          <>
            <Text style={styles.stateSubtitle}>Share your first outfit.</Text>
            <Pressable
              style={styles.createBtn}
              onPress={onCreateLook}
              accessibilityRole="button"
              accessibilityLabel="Create look"
            >
              <Text style={styles.createBtnText}>Create Look</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.stateSubtitle}>This member has not shared any public Looks.</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {looks.map((look) => {
        const captionPreview = look.caption
          ? look.caption.split('\n').find(Boolean)?.slice(0, 60)
          : undefined;
        const a11yLabel = captionPreview
          ? `Look: ${captionPreview}, ${look.tags.length} pieces, ${look.likeCount} likes`
          : `Look, ${look.tags.length} pieces, ${look.likeCount} likes`;

        return (
          <AnimatedPressable
            key={look.id}
            style={[styles.tile, { width: TILE_WIDTH }]}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('LookDetail', { lookId: look.id })}
            accessibilityRole="button"
            accessibilityLabel={a11yLabel}
          >
            <View style={styles.tileImageWrap}>
              <CachedImage
                uri={look.mediaUrl}
                style={styles.tileImage}
                contentFit="cover"
                emptyLabel="Look"
                emptyIcon="image-outline"
              />
            </View>
            {captionPreview ? (
              <Text style={styles.tileCaption} numberOfLines={1}>{captionPreview}</Text>
            ) : null}
            <View style={styles.tileMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="pricetag-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.metaText}>{look.tags.length}</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="heart-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.metaText}>{look.likeCount}</Text>
              </View>
            </View>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Space.md,
    gap: GRID_GAP,
  },
  tile: {
    marginBottom: 12,
  },
  tileImageWrap: {
    width: '100%',
    aspectRatio: 0.8,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileCaption: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    marginTop: 6,
  },
  tileMeta: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  stateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl * 2,
    gap: 10,
    paddingHorizontal: Space.md,
  },
  stateTitle: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  stateSubtitle: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: Colors.brand,
    borderRadius: 16,
  },
  retryBtnText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },
  createBtn: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: Colors.brand,
    borderRadius: 16,
  },
  createBtnText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: '#fff',
  },
});
