import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';

const BG = Colors.background;
const BORDER = Colors.border;
const MUTED = Colors.textMuted;
const TEXT = Colors.textPrimary;
const SECONDARY = Colors.textSecondary;

const TAB_HEIGHT = 44;

export type TabKey = 'Shop' | 'Looks' | 'Reviews';
export type SegmentKey = 'forsale' | 'sold';

interface TabRailProps {
  tabs: { key: TabKey; label: string; count?: number }[];
  activeKey: TabKey;
  onChange: (key: TabKey) => void;
}

/**
 * Tab rail with underline indicator. Used both inline (in list header)
 * and as an external sticky overlay. Identical visual in both positions.
 */
export function TabRail({ tabs, activeKey, onChange }: TabRailProps) {
  return (
    <View style={styles.tabRail}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label} tab${tab.count !== undefined ? `, ${tab.count} items` : ''}`}
          >
            <View style={styles.tabContent}>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]} numberOfLines={1}>
                {tab.label}
              </Text>
              {tab.count !== undefined ? (
                <Text style={[styles.tabCount, isActive && styles.tabCountActive]}>{tab.count}</Text>
              ) : null}
            </View>
            {isActive ? <View style={styles.tabUnderline} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

interface SegmentedControlProps {
  segments: { key: SegmentKey; label: string }[];
  activeKey: SegmentKey;
  onChange: (key: SegmentKey) => void;
}

/**
 * Editorial text segment for For sale / Sold. Not a pill bar.
 */
export function SegmentedControl({ segments, activeKey, onChange }: SegmentedControlProps) {
  return (
    <View style={styles.segmentControl}>
      {segments.map((seg) => {
        const isActive = seg.key === activeKey;
        return (
          <Pressable
            key={seg.key}
            style={styles.segment}
            onPress={() => onChange(seg.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={seg.label}
          >
            <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>{seg.label}</Text>
            {isActive ? <View style={styles.segmentUnderline} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabRail: {
    flexDirection: 'row',
    backgroundColor: BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  tab: { flex: 1, height: TAB_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  tabContent: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabLabel: { fontSize: 14, fontFamily: Typography.family.regular, color: MUTED },
  tabLabelActive: { fontFamily: Typography.family.bold, color: TEXT },
  tabCount: { fontSize: 13, fontFamily: Typography.family.regular, color: MUTED },
  tabCountActive: { color: SECONDARY },
  tabUnderline: {
    position: 'absolute', bottom: 0, left: '30%', right: '30%',
    height: 2, backgroundColor: TEXT, borderRadius: 1,
  },
  segmentControl: { flexDirection: 'row', gap: Space.lg },
  segment: { paddingVertical: 6, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  segmentLabel: { fontSize: 14, fontFamily: Typography.family.regular, color: MUTED },
  segmentLabelActive: { color: TEXT, fontFamily: Typography.family.semibold },
  segmentUnderline: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 2, backgroundColor: TEXT, borderRadius: 1,
  },
});
