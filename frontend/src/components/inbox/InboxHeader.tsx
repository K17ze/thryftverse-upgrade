import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { AnimatedPressable } from '../AnimatedPressable';
import { RootStackParamList } from '../../navigation/types';
import type { InboxSegment } from '../../hooks/inbox';

type NavT = NativeStackNavigationProp<RootStackParamList>;

const SECONDARY_SEGMENTS = ['requests', 'unread', 'archived', 'groups'];

export interface InboxHeaderProps {
  username?: string;
  filterExpanded: boolean;
  segment: InboxSegment;
  onToggleFilters: () => void;
}

export function InboxHeader({ username, filterExpanded, segment, onToggleFilters }: InboxHeaderProps) {
  const { colors } = useAppTheme();
  const navigation = useNavigation<NavT>();
  const t = useMemo(() => ({
    headerTitle: { color: colors.textPrimary },
    iconBtn: { backgroundColor: 'transparent' },
    filterDot: { backgroundColor: colors.brand },
  }), [colors]);
  const secondaryActive = SECONDARY_SEGMENTS.includes(segment);

  return (
    <View style={styles.compactHeader}>
      <AnimatedPressable
        style={styles.headerLeftWrap}
        onPress={() => navigation.navigate('ChatSettings')}
        activeOpacity={0.7}
        scaleValue={0.98}
        hapticFeedback="light"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel={`Account ${username || 'Messages'}`}
        accessibilityRole="button"
      >
        <Text style={[styles.headerTitle, t.headerTitle]} numberOfLines={1} accessibilityRole="header">
          {username || 'Messages'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textPrimary} style={styles.headerChevron} />
      </AnimatedPressable>
      <View style={styles.headerActions}>
        <AnimatedPressable
          style={[styles.iconBtn, t.iconBtn]}
          onPress={onToggleFilters}
          activeOpacity={0.7}
          scaleValue={0.95}
          hapticFeedback="light"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="More filters"
          accessibilityHint="Shows additional filters: requests, unread, archived, groups"
          accessibilityRole="button"
        >
          <Ionicons
            name={filterExpanded ? 'options' : 'options-outline'}
            size={22}
            color={filterExpanded || secondaryActive ? colors.brand : colors.textSecondary}
          />
          {secondaryActive && !filterExpanded ? (
            <View style={[styles.filterDot, t.filterDot]} />
          ) : null}
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.iconBtn, t.iconBtn]}
          onPress={() => navigation.navigate('Offers')}
          activeOpacity={0.7}
          scaleValue={0.95}
          hapticFeedback="light"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Offers"
          accessibilityHint="Opens offers you have sent and received"
          accessibilityRole="button"
        >
          <Ionicons name="pricetag-outline" size={20} color={colors.textSecondary} />
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.iconBtn, t.iconBtn]}
          onPress={() => navigation.navigate('ChatSettings')}
          activeOpacity={0.7}
          scaleValue={0.95}
          hapticFeedback="light"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Message settings"
          accessibilityHint="Opens privacy, automation, and quick reply settings"
          accessibilityRole="button"
        >
          <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.iconBtn, t.iconBtn]}
          onPress={() => navigation.navigate('NewMessage')}
          activeOpacity={0.7}
          scaleValue={0.95}
          hapticFeedback="light"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="New message"
          accessibilityHint="Opens message composer to start a new chat"
          accessibilityRole="button"
        >
          <Ionicons name="create-outline" size={23} color={colors.textPrimary} />
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs / 2,
  },
  headerLeftWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '70%',
    minHeight: 44,
  },
  headerChevron: {
    marginTop: 2,
  },
  headerTitle: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.screenTitle.letterSpacing,
    lineHeight: TypographyV2.screenTitle.lineHeight,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  iconBtn: {
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: RadiusRoleValue.pillAvatar,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterDot: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    width: Space.xs,
    height: Space.xs,
    borderRadius: RadiusRoleValue.pillAvatar,
  },
});
