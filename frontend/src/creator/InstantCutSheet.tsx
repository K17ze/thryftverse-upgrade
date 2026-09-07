/**
 * InstantCutSheet — Snapchat Quick Cut equivalent for ThryftVerse.
 *
 * Takes a set of selected media assets, auto-composes the best layout,
 * and presents an instant preview with a one-tap publish path.
 *
 * The thesis (Snapchat Quick Cut, Dec 2025): "choose your media and go" —
 * zero-timeline path for the casual majority. The user picks photos/clips,
 * Instant Cut picks the best layout, renders a preview, and publishes.
 *
 * Advanced users can still enter the full Look/Poster composer for
 * timeline editing — Instant Cut is the fast path, not the only path.
 */
import React, { useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Control, Elevation } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { autoCompose } from './look/layout/autoCompose';
import { LayoutPreviewRenderer } from './look/layout/LayoutPreviewRenderer';
import type { LayoutPreview } from './look/layout/layoutTypes';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface InstantCutSheetProps {
  visible: boolean;
  assetUris: string[];
  onClose: () => void;
  onPublish: (layoutId: string) => void;
  /** Optional: open the full composer with the current layout. */
  onOpenEditor?: (layoutId: string) => void;
}

export function InstantCutSheet({
  visible,
  assetUris,
  onClose,
  onPublish,
  onOpenEditor,
}: InstantCutSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  // Auto-compose layouts from the selected assets
  const { defaultLayout, alternatives } = useMemo(
    () => autoCompose(assetUris, SCREEN_WIDTH, SCREEN_WIDTH * 0.8),
    [assetUris],
  );

  const allLayouts = useMemo(
    () => [defaultLayout, ...alternatives],
    [defaultLayout, alternatives],
  );

  // Select the default layout on open
  React.useEffect(() => {
    if (visible) {
      setSelectedLayoutId(defaultLayout.id);
    }
  }, [visible, defaultLayout.id]);

  const selectedLayout = useMemo(
    () => allLayouts.find((l) => l.id === selectedLayoutId) ?? defaultLayout,
    [allLayouts, selectedLayoutId, defaultLayout],
  );

  // Preview canvas dimensions
  const previewWidth = SCREEN_WIDTH - Space.lg * 2;
  const previewHeight = previewWidth * 0.8;

  // Sheet animation
  const sheetTranslateY = useSharedValue(SCREEN_HEIGHT);
  const sheetOpacity = useSharedValue(0);

  React.useEffect(() => {
    if (visible) {
      sheetOpacity.value = withTiming(1, { duration: 200 });
      sheetTranslateY.value = reducedMotion
        ? 0
        : withSpring(0, { damping: 22, stiffness: 200 });
    } else {
      sheetOpacity.value = withTiming(0, { duration: 150 });
      sheetTranslateY.value = withTiming(SCREEN_HEIGHT, { duration: 200, easing: Easing.in(Easing.cubic) });
    }
  }, [visible, reducedMotion, sheetTranslateY, sheetOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: sheetOpacity.value,
  }));

  const handlePublish = useCallback(() => {
    haptic.medium();
    setIsPublishing(true);
    // The parent handles the actual publish flow (export → upload → publish)
    onPublish(selectedLayout.id);
    setIsPublishing(false);
  }, [haptic, onPublish, selectedLayout.id]);

  const handleOpenEditor = useCallback(() => {
    haptic.light();
    onOpenEditor?.(selectedLayout.id);
  }, [haptic, onOpenEditor, selectedLayout.id]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Reanimated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Reanimated.View style={[styles.sheet, sheetStyle]}>
          {/* Grab handle */}
          <View style={styles.grabHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Instant Cut</Text>
              <Text style={styles.subtitle}>
                {assetUris.length} {assetUris.length === 1 ? 'photo' : 'photos'} · auto-composed
              </Text>
            </View>
            <Pressable
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close instant cut"
            >
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          {/* Preview — the auto-composed layout with real asset thumbnails */}
          <View style={[styles.previewWrap, { width: previewWidth, height: previewHeight }]}>
            <LayoutPreviewRenderer
              layout={selectedLayout}
              assetUris={assetUris}
              width={previewWidth}
              height={previewHeight}
            />
          </View>

          {/* Layout alternatives — horizontal scroll */}
          {alternatives.length > 0 ? (
            <View style={styles.alternativesSection}>
              <Text style={styles.alternativesLabel}>Try a layout</Text>
              <View style={styles.alternativesRow}>
                {allLayouts.map((layout) => {
                  const isSelected = layout.id === selectedLayoutId;
                  return (
                    <Pressable
                      key={layout.id}
                      onPress={() => {
                        setSelectedLayoutId(layout.id);
                        haptic.selection();
                      }}
                      style={[
                        styles.altThumb,
                        isSelected && { borderColor: colors.brand, borderWidth: 2 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Layout: ${layout.name}`}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <LayoutPreviewRenderer
                        layout={layout}
                        assetUris={assetUris}
                        width={56}
                        height={45}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actionsRow}>
            {onOpenEditor ? (
              <Pressable
                style={styles.secondaryBtn}
                onPress={handleOpenEditor}
                accessibilityRole="button"
                accessibilityLabel="Open in editor"
              >
                <Ionicons name="create-outline" size={18} color={colors.textPrimary} />
                <Text style={styles.secondaryBtnText}>Edit</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
              onPress={handlePublish}
              disabled={isPublishing}
              accessibilityRole="button"
              accessibilityLabel="Publish instant cut"
            >
              {isPublishing ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <>
                  <Ionicons name="send" size={16} color={colors.textInverse} />
                  <Text style={styles.primaryBtnText}>Publish</Text>
                </>
              )}
            </Pressable>
          </View>
        </Reanimated.View>
      </Reanimated.View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingBottom: 40,
      ...Elevation.modal,
    },
    grabHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderSubtle,
      alignSelf: 'center',
      marginTop: Space.sm,
      marginBottom: Space.xs,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.lg,
      paddingVertical: Space.sm,
    },
    headerText: {
      flex: 1,
    },
    title: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      marginTop: 2,
    },
    previewWrap: {
      alignSelf: 'center',
      borderRadius: Radius.lg,
      overflow: 'hidden',
      marginVertical: Space.md,
      ...Elevation.card,
    },
    alternativesSection: {
      paddingHorizontal: Space.lg,
      marginBottom: Space.md,
    },
    alternativesLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      marginBottom: Space.sm,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    alternativesRow: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    altThumb: {
      width: 60,
      height: 48,
      borderRadius: Radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      paddingHorizontal: Space.lg,
    },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.lg,
      borderRadius: Radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: Control.hit,
    },
    secondaryBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
    },
    primaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.full,
      minHeight: Control.hit,
    },
    primaryBtnText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textInverse,
    },
  });
}
