import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { AnimatedPressable } from '../AnimatedPressable';
import {
  Space,
  Radius,
  Stroke,
  Typography,
  Type,
  Control,
} from '../../theme/designTokens';

export interface SearchHistoryItem {
  term: string;
  timestamp: number;
  pinned: boolean;
}

export interface SearchHistoryManagerProps {
  items: SearchHistoryItem[];
  onDeleteItem: (term: string) => void;
  onClearAll: () => void;
  onTogglePin: (term: string) => void;
  onSelectItem: (term: string) => void;
  onDone: () => void;
}

function formatTimestamp(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function SearchHistoryManager({
  items,
  onDeleteItem,
  onClearAll,
  onTogglePin,
  onSelectItem,
  onDone,
}: SearchHistoryManagerProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const sortedItems = useMemo(() => {
    const pinned = items.filter((item) => item.pinned);
    const rest = items.filter((item) => !item.pinned).sort((a, b) => b.timestamp - a.timestamp);
    return [...pinned, ...rest];
  }, [items]);

  const handleDelete = useCallback(
    (term: string) => {
      haptic.light();
      onDeleteItem(term);
    },
    [haptic, onDeleteItem],
  );

  const handleTogglePin = useCallback(
    (term: string) => {
      haptic.selection();
      onTogglePin(term);
    },
    [haptic, onTogglePin],
  );

  const handleClearAll = useCallback(() => {
    haptic.medium();
    onClearAll();
  }, [haptic, onClearAll]);

  const handleDone = useCallback(() => {
    haptic.light();
    onDone();
  }, [haptic, onDone]);

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Manage searches</Text>
          <AnimatedPressable
            style={styles.doneBtn}
            onPress={handleDone}
            activeOpacity={0.8}
            accessibilityLabel="Done managing searches"
            accessibilityRole="button"
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </AnimatedPressable>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={24} color={colors.textMuted} />
          <Text style={styles.emptyText}>No search history yet</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Manage searches</Text>
        <AnimatedPressable
          style={styles.doneBtn}
          onPress={handleDone}
          activeOpacity={0.8}
          accessibilityLabel="Done managing searches"
          accessibilityRole="button"
        >
          <Text style={styles.doneBtnText}>Done</Text>
        </AnimatedPressable>
      </View>

      {sortedItems.map((item) => (
        <View key={item.term} style={styles.row}>
          <Pressable
            style={styles.rowMain}
            onPress={() => onSelectItem(item.term)}
            accessibilityLabel={`Search for ${item.term}`}
            accessibilityRole="button"
          >
            <View style={styles.rowLeft}>
              <AnimatedPressable
                style={styles.pinBtn}
                onPress={() => handleTogglePin(item.term)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={item.pinned ? `Unpin ${item.term}` : `Pin ${item.term}`}
                accessibilityRole="button"
              >
                <Ionicons
                  name={item.pinned ? 'pin' : 'pin-outline'}
                  size={16}
                  color={item.pinned ? colors.brand : colors.textMuted}
                />
              </AnimatedPressable>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowTerm} numberOfLines={1}>{item.term}</Text>
                <Text style={styles.rowMeta}>
                  {item.pinned ? 'Pinned' : formatTimestamp(item.timestamp)}
                </Text>
              </View>
            </View>
          </Pressable>
          <AnimatedPressable
            style={styles.deleteBtn}
            onPress={() => handleDelete(item.term)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={`Delete ${item.term} from search history`}
            accessibilityRole="button"
          >
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </AnimatedPressable>
        </View>
      ))}

      <View style={styles.footer}>
        <AnimatedPressable
          style={styles.clearAllBtn}
          onPress={handleClearAll}
          activeOpacity={0.8}
          accessibilityLabel="Clear all search history"
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
          <Text style={styles.clearAllText}>Clear all history</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Space.sm + 2,
    },
    headerTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
      letterSpacing: Type.subtitle.letterSpacing,
    },
    doneBtn: {
      paddingHorizontal: Space.sm + 4,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.full,
      backgroundColor: colors.surfaceAlt,
    },
    doneBtnText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.brand,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm + 2,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
      minHeight: Control.hit,
    },
    rowMain: {
      flex: 1,
    },
    rowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    pinBtn: {
      width: Control.chrome,
      height: Control.chrome,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTextWrap: {
      flex: 1,
      gap: Space.xs / 2,
    },
    rowTerm: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
      color: colors.textPrimary,
    },
    rowMeta: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      letterSpacing: 0.15,
    },
    deleteBtn: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footer: {
      marginTop: Space.sm + 2,
      paddingTop: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
    },
    clearAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs + 2,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      borderColor: colors.danger,
    },
    clearAllText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.semibold,
      color: colors.danger,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.xl,
      gap: Space.sm,
    },
    emptyText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
  });
}
