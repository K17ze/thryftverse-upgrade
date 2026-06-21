import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '../CachedImage';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { Colors } from '../../constants/colors';
import type { PosterHighlight } from '../../services/postersApi';

interface ProfileHighlightsRowProps {
  highlights: PosterHighlight[];
  isLoading?: boolean;
  isOwner?: boolean;
  onHighlightPress: (highlight: PosterHighlight) => void;
  onAddHighlight?: () => void;
  onEditHighlight?: (highlight: PosterHighlight) => void;
}

export function ProfileHighlightsRow({
  highlights,
  isLoading,
  isOwner,
  onHighlightPress,
  onAddHighlight,
  onEditHighlight,
}: ProfileHighlightsRowProps) {
  if (isLoading) {
    return (
      <View style={styles.container}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={styles.highlightItem}>
              <View style={styles.skeletonCircle} />
              <View style={styles.skeletonLabel} />
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (!isOwner && highlights.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {isOwner && onAddHighlight && (
          <Pressable
            style={styles.highlightItem}
            onPress={onAddHighlight}
            accessibilityLabel="Create new highlight"
            accessibilityRole="button"
          >
            <View style={styles.addCircle}>
              <Ionicons name="add" size={22} color={Colors.textSecondary} />
            </View>
            <Text style={styles.addLabel}>New</Text>
          </Pressable>
        )}

        {highlights.map((highlight) => (
          <Pressable
            key={highlight.id}
            style={styles.highlightItem}
            onPress={() => onHighlightPress(highlight)}
            onLongPress={() => onEditHighlight?.(highlight)}
            delayLongPress={400}
            accessibilityLabel={`Highlight: ${highlight.title}`}
            accessibilityRole="button"
          >
            <View style={styles.highlightCircle}>
              {highlight.coverUrl ? (
                <CachedImage
                  uri={highlight.coverUrl}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  containerStyle={{ borderRadius: Radius.full, overflow: 'hidden' }}
                />
              ) : (
                <View style={styles.placeholderCircle}>
                  <Ionicons name="bookmark" size={20} color={Colors.textMuted} />
                </View>
              )}
            </View>
            <Text style={styles.highlightLabel} numberOfLines={1}>{highlight.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const CIRCLE_SIZE = 64;

const styles = StyleSheet.create({
  container: {
    paddingVertical: Space.sm,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    gap: Space.md,
    alignItems: 'center',
  },
  highlightItem: {
    alignItems: 'center',
    gap: 4,
    width: CIRCLE_SIZE + 8,
  },
  highlightCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: Colors.border,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderCircle: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    width: '100%',
    height: '100%',
    borderRadius: Radius.full,
  },
  addCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
  },
  highlightLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  addLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  skeletonCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
  },
  skeletonLabel: {
    width: 40,
    height: 10,
    borderRadius: 4,
    backgroundColor: Colors.surfaceAlt,
    marginTop: 4,
  },
});

