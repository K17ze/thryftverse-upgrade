/**
 * AccessibilityZOrderSheet — keyboard/button-based alternative to
 * drag-to-reorder for z-order (layer stacking).
 *
 * Per spec 09_VISUAL_SYSTEM_MOTION_ACCESSIBILITY, users who cannot
 * perform drag gestures need an alternative way to reorder layers.
 * This sheet provides:
 *   - the selected layer's current z-index position
 *   - Bring to Front / Send to Back / Forward One / Backward One
 *   - a mini layer stack list with the current position highlighted
 *
 * Per AGENTS.md §11: every control performs a real mutation via
 * onReorder, which the host screen wires to reorderLayer.
 * Per AGENTS.md §13: all buttons meet the 44pt minimum touch target.
 *
 * Uses the shared SheetContainer from ../CreatorAnimations for
 * consistent motion and chrome.
 */
import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useHaptic } from '../../hooks/useHaptic';
import { PressScale, SheetContainer } from '../CreatorAnimations';

const TOUCH = 44;

export interface ZOrderLayer {
  id: string;
  label: string;
  zIndex: number;
}

export interface AccessibilityZOrderSheetProps {
  visible: boolean;
  layers: ZOrderLayer[];
  selectedLayerId: string | null;
  onClose: () => void;
  onReorder: (
    layerId: string,
    direction: 'front' | 'back' | 'forward' | 'backward',
  ) => void;
}

type ReorderDirection = 'front' | 'back' | 'forward' | 'backward';

/**
 * Shows keyboard/button-based z-order alternatives for the selected
 * layer. The host screen passes the layer stack and an onReorder
 * callback wired to reorderLayer. Every button performs a real
 * mutation.
 */
export function AccessibilityZOrderSheet({
  visible,
  layers,
  selectedLayerId,
  onClose,
  onReorder,
}: AccessibilityZOrderSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const haptic = useHaptic();

  // Sort the mini stack front-to-back (highest zIndex first) so the
  // list reads top = front, bottom = back, matching the visual stack.
  const sortedLayers = useMemo(
    () => [...layers].sort((a, b) => b.zIndex - a.zIndex),
    [layers],
  );

  const selectedIndex = useMemo(
    () => sortedLayers.findIndex((l) => l.id === selectedLayerId),
    [sortedLayers, selectedLayerId],
  );

  const canEdit = !!selectedLayerId && selectedIndex >= 0;
  const isFront = canEdit && selectedIndex === 0;
  const isBack = canEdit && selectedIndex === sortedLayers.length - 1;

  const handleReorder = useCallback(
    (direction: ReorderDirection) => {
      if (!selectedLayerId) return;
      haptic.light();
      onReorder(selectedLayerId, direction);
    },
    [selectedLayerId, haptic, onReorder],
  );

  const reorderActions: {
    direction: ReorderDirection;
    label: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    disabled: boolean;
    hint: string;
  }[] = [
    {
      direction: 'front',
      label: 'Bring to Front',
      icon: 'arrow-up-circle-outline',
      disabled: !canEdit || isFront,
      hint: 'Moves the selected object to the very front of the stack',
    },
    {
      direction: 'forward',
      label: 'Forward One',
      icon: 'chevron-up-circle-outline',
      disabled: !canEdit || isFront,
      hint: 'Moves the selected object forward by one layer',
    },
    {
      direction: 'backward',
      label: 'Backward One',
      icon: 'chevron-down-circle-outline',
      disabled: !canEdit || isBack,
      hint: 'Moves the selected object backward by one layer',
    },
    {
      direction: 'back',
      label: 'Send to Back',
      icon: 'arrow-down-circle-outline',
      disabled: !canEdit || isBack,
      hint: 'Moves the selected object to the very back of the stack',
    },
  ];

  return (
    <SheetContainer visible={visible} onClose={onClose} maxHeight={0.8}>
      <View style={{ paddingBottom: Math.max(insets.bottom, Space.md) }}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <PressScale
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close z-order sheet"
            accessibilityHint="Closes the accessibility z-order sheet"
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </PressScale>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Arrange
          </Text>
          <View style={styles.closeBtnPlaceholder} />
        </View>

        {!canEdit ? (
          <View style={styles.emptyState}>
            <Ionicons name="layers-outline" size={36} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Select an object to arrange it
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
              Tap an object on the canvas, then reopen this sheet
            </Text>
          </View>
        ) : (
          <View style={styles.body}>
            {/* ── Current position readout ── */}
            <View style={[styles.readout, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="layers-outline" size={20} color={colors.textMuted} />
              <Text style={[styles.readoutText, { color: colors.textPrimary }]}>
                Position {selectedIndex + 1} of {sortedLayers.length}
              </Text>
            </View>

            {/* ── Reorder action buttons ── */}
            <View style={styles.actionGrid}>
              {reorderActions.map((action) => (
                <PressScale
                  key={action.direction}
                  onPress={() => handleReorder(action.direction)}
                  disabled={action.disabled}
                  style={[
                    styles.actionBtn,
                    { backgroundColor: colors.surfaceAlt, opacity: action.disabled ? 0.4 : 1 },
                  ]}
                  accessibilityLabel={action.label}
                  accessibilityHint={action.hint}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: action.disabled }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name={action.icon} size={24} color={colors.textPrimary} />
                  <Text
                    style={[styles.actionBtnText, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {action.label}
                  </Text>
                </PressScale>
              ))}
            </View>

            {/* ── Mini layer stack ── */}
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              Layer stack
            </Text>
            <View style={[styles.stackContainer, { backgroundColor: colors.surfaceAlt }]}>
              <ScrollView
                style={styles.stackScroll}
                contentContainerStyle={styles.stackContent}
                showsVerticalScrollIndicator={false}
              >
                {sortedLayers.map((layer, i) => {
                  const isSelected = layer.id === selectedLayerId;
                  return (
                    <View
                      key={layer.id}
                      style={[
                        styles.stackRow,
                        isSelected && { backgroundColor: colors.brandSubtle },
                        i > 0 && { borderTopColor: colors.borderSubtle, borderTopWidth: StyleSheet.hairlineWidth },
                      ]}
                    >
                      <Text
                        style={[
                          styles.stackIndex,
                          { color: isSelected ? colors.brand : colors.textMuted },
                        ]}
                      >
                        {i + 1}
                      </Text>
                      <Text
                        style={[
                          styles.stackLabel,
                          {
                            color: isSelected ? colors.textPrimary : colors.textSecondary,
                            fontWeight: isSelected ? '600' : '400',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {layer.label}
                      </Text>
                      {isSelected && (
                        <View style={[styles.stackBadge, { backgroundColor: colors.brand }]}>
                          <Text style={[styles.stackBadgeText, { color: colors.textInverse }]}>
                            Selected
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        )}
      </View>
    </SheetContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
  },
  closeBtn: {
    width: TOUCH,
    height: TOUCH,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  closeBtnPlaceholder: {
    width: TOUCH,
  },
  body: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.lg,
    gap: Space.md,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.sm,
    paddingHorizontal: Space.lg,
  },
  emptyText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
    textAlign: 'center',
  },
  emptySubtext: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    textAlign: 'center',
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  readoutText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
    fontVariant: ['tabular-nums'],
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  actionBtn: {
    flexGrow: 1,
    flexBasis: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    height: TOUCH,
    borderRadius: Radius.md,
  },
  actionBtnText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    flexShrink: 1,
  },
  sectionLabel: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.metaElevated.size,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  stackContainer: {
    borderRadius: Radius.lg,
    maxHeight: 220,
  },
  stackScroll: {
    borderRadius: Radius.lg,
  },
  stackContent: {
    paddingVertical: Space.xs,
  },
  stackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    minHeight: TOUCH,
  },
  stackIndex: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
    width: 24,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  stackLabel: {
    flex: 1,
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
  },
  stackBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  stackBadgeText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.meta.size,
    letterSpacing: Type.meta.letterSpacing,
  },
});
