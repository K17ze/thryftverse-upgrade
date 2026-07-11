import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';

export interface ProfileCompletenessInput {
  avatar?: string | null;
  coverPhoto?: string | null;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  emailVerified?: boolean;
  hasListings?: boolean;
}

interface CompletenessItem {
  key: string;
  label: string;
  icon: string;
  done: boolean;
}

function calculateCompleteness(input: ProfileCompletenessInput): {
  score: number;
  items: CompletenessItem[];
} {
  const items: CompletenessItem[] = [
    { key: 'avatar', label: 'Profile photo', icon: 'person-circle-outline', done: !!input.avatar },
    { key: 'cover', label: 'Cover photo', icon: 'image-outline', done: !!input.coverPhoto },
    { key: 'bio', label: 'Bio', icon: 'text-outline', done: !!input.bio?.trim() },
    { key: 'location', label: 'Location', icon: 'location-outline', done: !!input.location?.trim() },
    { key: 'website', label: 'Website', icon: 'link-outline', done: !!input.website?.trim() },
    { key: 'emailVerified', label: 'Email verified', icon: 'mail-checkmark-outline', done: !!input.emailVerified },
    { key: 'listings', label: 'First listing', icon: 'pricetag-outline', done: !!input.hasListings },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const score = Math.round((doneCount / items.length) * 100);
  return { score, items };
}

export interface ProfileCompletenessIndicatorProps {
  input: ProfileCompletenessInput;
  onCompleteProfile?: () => void;
}

/**
 * Shows a profile completeness progress bar with missing items.
 * Only renders when completeness is below 100%.
 */
export function ProfileCompletenessIndicator({
  input,
  onCompleteProfile,
}: ProfileCompletenessIndicatorProps) {
  const { score, items } = React.useMemo(() => calculateCompleteness(input), [input]);
  const missingItems = items.filter((i) => !i.done);

  if (score >= 100 || missingItems.length === 0) return null;

  const barColor = score >= 75 ? Colors.success : score >= 50 ? Colors.brand : Colors.warning;

  return (
    <Pressable
      style={styles.container}
      onPress={onCompleteProfile}
      disabled={!onCompleteProfile}
      accessibilityRole={onCompleteProfile ? 'button' : undefined}
      accessibilityLabel={`Profile ${score}% complete. ${missingItems.length} item${missingItems.length > 1 ? 's' : ''} remaining.`}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="ribbon-outline" size={16} color={barColor} />
          <Text style={styles.title}>Profile {score}% complete</Text>
        </View>
        {onCompleteProfile ? (
          <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
        ) : null}
      </View>

      {/* Progress bar */}
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${score}%`, backgroundColor: barColor }]} />
      </View>

      {/* Missing items */}
      <View style={styles.itemsRow}>
        {missingItems.slice(0, 4).map((item) => (
          <View key={item.key} style={styles.missingChip}>
            <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={11} color={Colors.textMuted} />
            <Text style={styles.missingChipText}>{item.label}</Text>
          </View>
        ))}
        {missingItems.length > 4 ? (
          <View style={styles.missingChip}>
            <Text style={styles.missingChipText}>+{missingItems.length - 4}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  itemsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  missingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
  },
  missingChipText: {
    fontSize: 10,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
});
