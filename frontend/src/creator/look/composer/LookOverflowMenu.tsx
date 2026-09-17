import React from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/ThemeContext';
import { OverflowItem } from '../../studio/OverflowMenu';
import type { getOverflowTools } from '../../core/toolRegistry';
import { lookComposerStyles as styles } from '../LookComposerStyles';

// ── Global overflow groups ────────────────────────────────────────────
// Grouped like the Poster composer's overflow sheet: Canvas, Project,
// Accessibility, Help. Context tools render above these.
export type GlobalOverflowItem = {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
};

export type GlobalOverflowGroup = {
  id: string;
  items: GlobalOverflowItem[];
};

// ── Overflow menu (presentational) ──────────────────────────────────
// Extracted from LookComposerScreen — pure relocation, no changes.
export function LookOverflowMenu({
  showOverflow,
  topInset,
  screenHeight,
  overflowContextTools,
  globalOverflowGroups,
  setShowOverflow,
  colors }: {
  showOverflow: boolean;
  topInset: number;
  screenHeight: number;
  overflowContextTools: ReturnType<typeof getOverflowTools>;
  globalOverflowGroups: GlobalOverflowGroup[];
  setShowOverflow: (show: boolean) => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <>
      {/* ── Overflow menu (context tools, then grouped global tools) ────── */}
      {showOverflow && (
        <View style={[styles.overflowContainer, { top: topInset + 48 }]}>
          <View
            style={[
              styles.overflowMenu,
              { borderColor: colors.border, backgroundColor: colors.surface, maxHeight: Math.min(screenHeight * 0.68, 620) },
            ]}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              {overflowContextTools.map((tool) => (
                <OverflowItem
                  key={tool.id}
                  icon={tool.icon}
                  glyph={tool.glyph}
                  label={tool.label}
                  disabled={tool.disabled}
                  danger={tool.id.endsWith('-delete')}
                  colors={colors}
                  onPress={() => { tool.onPress(); setShowOverflow(false); }}
                />
              ))}
              {overflowContextTools.length > 0 && (
                <View style={[styles.overflowSectionDivider, { backgroundColor: colors.border }]} />
              )}
              {globalOverflowGroups.map((group, groupIndex) => (
                <View
                  key={group.id}
                  style={[styles.overflowGroup, groupIndex > 0 && styles.overflowGroupGap]}
                >
                  {group.items.map((item) => (
                    <OverflowItem
                      key={item.id}
                      icon={item.icon}
                      label={item.label}
                      onPress={() => { item.onPress(); setShowOverflow(false); }}
                      colors={colors}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
          <Pressable style={styles.overflowBackdrop} onPress={() => setShowOverflow(false)} />
        </View>
      )}
    </>
  );
}
