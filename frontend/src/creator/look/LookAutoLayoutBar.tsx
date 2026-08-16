/**
 * LookAutoLayoutBar — horizontal scrollable bar for selecting an automatic
 * layout style for a Look collage.
 *
 * Renders one button per layout style in `LAYOUT_STYLES` (grid, masonry,
 * feature, strip, collage). The active style is highlighted with the brand
 * color via CreatorToolButton's 'fill' selected style. Each button has a
 * 44pt+ touch target and fires a selection haptic on press.
 *
 * The bar is intentionally compact — a single horizontal scroll row with
 * icon + label — so it reads as an overlay tool, not a competing panel
 * (AGENTS.md §4: surface budget).
 *
 * Per AGENTS.md §11 (truthful UI): every style maps to a real layout
 * algorithm in LookAutoLayout.ts — no stubs.
 * Per AGENTS.md §13: 44pt touch targets, haptics on selection.
 */
import React, { useCallback } from 'react';
import { StyleSheet, ScrollView, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { CreatorToolButton } from '../controls/CreatorToolButton';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { LAYOUT_STYLES, type LayoutStyle } from './LookAutoLayout';

// ── Style metadata ─────────────────────────────────────────────────────

interface LayoutStyleMeta {
  style: LayoutStyle;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

/**
 * The canonical metadata for each layout style button. Icons are chosen to
 * communicate the layout's character:
 *   grid     → grid-outline (even cells)
 *   masonry  → newspaper-outline (varied-height columns)
 *   feature  → star-outline (one hero stands out)
 *   strip    → list-outline (horizontal row)
 *   collage  → shapes-outline (overlapping, rotated)
 */
const STYLE_META: LayoutStyleMeta[] = [
  { style: 'grid', label: 'Grid', icon: 'grid-outline' },
  { style: 'masonry', label: 'Masonry', icon: 'newspaper-outline' },
  { style: 'feature', label: 'Feature', icon: 'star-outline' },
  { style: 'strip', label: 'Strip', icon: 'list-outline' },
  { style: 'collage', label: 'Collage', icon: 'shapes-outline' },
];

// ── Types ──────────────────────────────────────────────────────────────

export interface LookAutoLayoutBarProps {
  /** The currently active layout style, or null if none is active. */
  activeStyle: LayoutStyle | null;
  /** Called when the user selects a layout style. */
  onSelect: (style: LayoutStyle) => void;
  /** Whether the bar is disabled (e.g. while a layout is being applied). */
  disabled?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────

/**
 * Horizontal scrollable bar of auto-layout style buttons.
 *
 * Each style is a CreatorToolButton with a 44pt+ touch target, an icon,
 * and a label. The active style shows a filled brand backplate. Haptics
 * fire on selection (CreatorToolButton fires an internal selection haptic;
 * we add a light haptic at the bar level for compounded feedback).
 */
export function LookAutoLayoutBar({
  activeStyle,
  onSelect,
  disabled = false,
}: LookAutoLayoutBarProps): React.ReactElement {
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();

  const handleSelect = useCallback(
    (style: LayoutStyle) => {
      if (reducedMotion) return;
      haptic.light();
      onSelect(style);
    },
    [haptic, onSelect, reducedMotion],
  );

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {STYLE_META.map((meta) => (
          <CreatorToolButton
            key={meta.style}
            icon={meta.icon}
            label={meta.label}
            active={activeStyle === meta.style}
            selectedStyle="fill"
            disabled={disabled}
            onPress={() => handleSelect(meta.style)}
            accessibilityLabel={`Auto layout: ${meta.label}`}
            accessibilityHint={
              activeStyle === meta.style
                ? 'Currently active layout'
                : `Arrange media with the ${meta.label} layout`
            }
            testID={`look-auto-layout-${meta.style}`}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    // Transparent horizontal scroll — no card, no background — so it reads
    // as an overlay tool rail (AGENTS.md §4: surface budget).
    paddingVertical: 4,
  } as ViewStyle,
  scrollContent: {
    paddingHorizontal: 12,
    gap: 4,
    alignItems: 'center',
  },
});

export default LookAutoLayoutBar;
