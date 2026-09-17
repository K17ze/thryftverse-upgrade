/**
 * PosterOverflowSurface — the "More" tools overflow sheet of the Poster
 * composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no visual or
 * behavioral change). Renders the actual overflow tools from the active
 * context's ToolGroup (Draw, Timeline, Cutout, Animation, etc.) plus
 * persistent items (Accessibility, Help) that aren't in the tool groups.
 * This replaced the former hardcoded list that ignored the
 * ContextToolRail's overflowTools array — tools moved to overflow are now
 * actually accessible.
 *
 * Also exports `buildPosterOverflowSections`, the pure section builder
 * previously a `useMemo` in the screen.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, type ViewStyle, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { IconGrammar, Radius } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { OverflowItem } from '../../studio/OverflowMenu';
import type { ToolDefinition } from '../../core/toolRegistry';
import type { ActiveSheet } from '../useActiveSheet';

// ── Types ────────────────────────────────────────────────────────────

/**
 * One titled group of overflow tools (Advanced editing / Accessibility /
 * Project). Empty sections are dropped by the builder.
 */
export interface PosterOverflowSection {
  title: 'Advanced editing' | 'Accessibility' | 'Project';
  tools: ToolDefinition[];
}

export interface PosterOverflowSectionsInput {
  /** Overflow tools from the active context's ToolGroup. */
  activeOverflowTools: ToolDefinition[];
  hasMultipleFrames: boolean;
  /** Whether the export service can render the active page. */
  canExportDraft: boolean;
  /** Exports the active page to the camera roll. */
  handleExportDraftImage: () => void;
  /** Opens the frame organizer tray. */
  setShowFrameTray: (visible: boolean) => void;
}

/**
 * The subset of the screen's StyleSheet styles the overflow renders. The
 * parent passes its full `styles` object; only these keys are read.
 */
export interface PosterOverflowSurfaceStyles {
  overflowContainer: ViewStyle;
  overflowBackdrop: ViewStyle;
  overflowMenu: ViewStyle;
  overflowHeader: ViewStyle;
  overflowClose: ViewStyle;
  overflowClosePressed: ViewStyle;
  overflowScrollContent: ViewStyle;
  overflowGroup: ViewStyle;
  overflowGroupGap: ViewStyle;
  overflowSectionTitle: TextStyle;
}

export interface PosterOverflowSurfaceProps {
  /** Screen styles (the parent's full createStyles() object). */
  styles: PosterOverflowSurfaceStyles;
  /** Theme colors. */
  colors: ThemeColors;
  screenHeight: number;
  /** Bottom safe-area inset (padding under the sheet). */
  bottomInset: number;
  /** Closes the sheet (backdrop, close button, and after each tool tap). */
  closeSheet: () => void;
  /** Opens a mutually-exclusive sheet (a11y editors, help). */
  openSheet: (sheet: Exclude<ActiveSheet, null>) => void;
  /** Titled tool sections built by buildPosterOverflowSections. */
  overflowSections: PosterOverflowSection[];
  /** Destructive tools (Delete) rendered last with danger styling. */
  overflowDestructive: ToolDefinition[];
}

// ── Section builder ──────────────────────────────────────────────────

export function buildPosterOverflowSections({
  activeOverflowTools,
  hasMultipleFrames,
  canExportDraft,
  handleExportDraftImage,
  setShowFrameTray,
}: PosterOverflowSectionsInput): PosterOverflowSection[] {
  const sectionFor = (id: string): 'Advanced editing' | 'Accessibility' | 'Project' => {
    if (['draw', 'replace', 'crop', 'adjust', 'effects', 'auto', 'cutout', 'animation', 'speed-curve', 'reverse', 'freeze-frame', 'audio-fade', 'duplicate', 'delete', 'edit-clip'].includes(id)) {
      return 'Advanced editing';
    }
    if (['move-precisely', 'arrange-precisely', 'safe-zone', 'a11yMove', 'a11yZOrder', 'layers'].includes(id)) {
      return 'Accessibility';
    }
    return 'Project';
  };
  const tools: ToolDefinition[] = [
    ...(hasMultipleFrames
      ? [
          ...activeOverflowTools.filter((tool) => tool.id !== 'delete'),
          {
            id: 'manage-frames',
            label: 'Manage frames',
            icon: 'albums-outline' as const,
            onPress: () => { setShowFrameTray(true); },
            accessibilityLabel: 'Manage frames',
            accessibilityHint: 'Opens the frame organizer',
          },
        ]
      : activeOverflowTools.filter((tool) => tool.id !== 'delete')),
    // Export-without-posting (Edits parity). Image frames only ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the
    // control is omitted entirely when the export service can't render
    // the content (e.g. video without the native module).
    ...(canExportDraft
      ? [{
          id: 'export-draft',
          label: 'Export image',
          icon: 'download-outline' as const,
          onPress: () => { void handleExportDraftImage(); },
          accessibilityLabel: 'Export image',
          accessibilityHint: 'Saves the current frame to your camera roll',
        }]
      : []),
  ];
  return (['Advanced editing', 'Accessibility', 'Project'] as const)
    .map((title) => ({
      title,
      tools: tools.filter((tool) => sectionFor(tool.id) === title),
    }))
    .filter((section) => section.tools.length > 0);
}

// ── Component ────────────────────────────────────────────────────────

export function PosterOverflowSurface({
  styles,
  colors,
  screenHeight,
  bottomInset,
  closeSheet,
  openSheet,
  overflowSections,
  overflowDestructive,
}: PosterOverflowSurfaceProps) {
  return (
    <View style={styles.overflowContainer}>
      <Pressable
        style={styles.overflowBackdrop}
        onPress={closeSheet}
        accessibilityLabel="Close tools"
        accessibilityHint="Closes the tools overflow"
        accessibilityRole="button"
      />
      <View
        style={[
          styles.overflowMenu,
          { maxHeight: Math.min(screenHeight * 0.68, 620), paddingBottom: bottomInset },
        ]}
        accessibilityViewIsModal
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceElevated, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl }]} />
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
        <View style={styles.overflowHeader}>
          <Pressable
            onPress={closeSheet}
            style={({ pressed }) => [styles.overflowClose, pressed && styles.overflowClosePressed]}
            accessibilityRole="button"
            accessibilityLabel="Close tools"
            accessibilityHint="Closes the tools overflow"
          >
            <Ionicons name="close" size={IconGrammar.standard} color={colors.scrimTextPrimary} />
          </Pressable>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.overflowScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {overflowSections.map((section, sectionIndex) => (
            <View
              key={section.title}
              style={[styles.overflowGroup, sectionIndex > 0 && styles.overflowGroupGap]}
            >
              <Text style={[styles.overflowSectionTitle, { color: colors.textMuted }]}>
                {section.title}
              </Text>
              {section.tools.map((tool) => (
                <OverflowItem
                  key={tool.id}
                  icon={tool.icon}
                  glyph={tool.glyph}
                  label={tool.label}
                  selected={tool.active}
                  onPress={() => { tool.onPress(); closeSheet(); }}
                />
              ))}
            </View>
          ))}
          <View style={[styles.overflowGroup, styles.overflowGroupGap]}>
            <Text style={[styles.overflowSectionTitle, { color: colors.textMuted }]}>Accessibility</Text>
            <OverflowItem
              icon="accessibility-outline"
              label="Move precisely"
              onPress={() => { openSheet('a11yMove'); closeSheet(); }}
            />
            <OverflowItem
              icon="swap-vertical-outline"
              label="Arrange precisely"
              onPress={() => { openSheet('a11yZOrder'); closeSheet(); }}
            />
            <OverflowItem
              icon="resize-outline"
              label="Resize & rotate"
              onPress={() => { openSheet('a11yTransform'); closeSheet(); }}
            />
          </View>
          <View style={[styles.overflowGroup, styles.overflowGroupGap]}>
            <Text style={[styles.overflowSectionTitle, { color: colors.textMuted }]}>Project</Text>
            <OverflowItem
              icon="help-circle-outline"
              label="Help & shortcuts"
              onPress={() => { openSheet('help'); closeSheet(); }}
            />
          </View>
          {overflowDestructive.length > 0 && (
            <View style={[styles.overflowGroup, styles.overflowGroupGap]}>
              <Text style={[styles.overflowSectionTitle, { color: colors.textMuted }]}>Advanced editing</Text>
              {overflowDestructive.map((tool) => (
                <OverflowItem
                  key={tool.id}
                  icon={tool.icon}
                  glyph={tool.glyph}
                  label={tool.label}
                  danger
                  onPress={() => { tool.onPress(); closeSheet(); }}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}
