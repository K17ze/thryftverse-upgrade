/**
 * textEditorStyles — shared StyleSheet for the text editor sheet and its
 * extracted sub-components.
 *
 * Extracted from TextEditorSheet.tsx (pure extraction, zero behavior change).
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import {
  Space,
  Radius,
  Typography,
  Stroke,
  Control,
  FontFamily } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import type { ThemeColors } from '../../../theme/ThemeContext';

export function useEditorStyles(colors: ThemeColors) {
  return React.useMemo(
    () =>
      StyleSheet.create({
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Space.md,
          paddingTop: Space.sm,
          paddingBottom: Space.sm },
        title: {
          fontFamily: Typography.family.semibold,
          fontSize: TypographyV2.bodyStrong.size },
        closeBtn: {
          width: Control.hit,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center' },
        body: {
          paddingHorizontal: Space.md,
          paddingBottom: Space.lg,
          gap: Space.sm },
        preview: {
          minHeight: 72,
          borderRadius: Radius.lg,
          borderWidth: Stroke.hairline,
          borderColor: colors.borderSubtle,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          overflow: 'hidden' },
        strokePreviewWrap: {
          // The multi-shadow stroke technique requires a relative container
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'stretch' },
        input: {
          fontFamily: Typography.family.regular,
          fontSize: TypographyV2.body.size,
          color: colors.textPrimary,
          borderWidth: Stroke.standard,
          borderColor: colors.border,
          borderRadius: Radius.md,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          minHeight: 48 },
        sectionLabel: {
          fontFamily: Typography.family.semibold,
          fontSize: TypographyV2.label.size,
          letterSpacing: TypographyV2.label.letterSpacing,
          textTransform: 'uppercase',
          color: colors.textSecondary,
          marginTop: Space.xs },
        colorPicker: {
          // No extra padding — CreatorColorPicker manages its own layout
        },
        tabBar: {
          flexDirection: 'row',
          position: 'relative' },
        tabItem: {
          flex: 1,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center' },
        tabUnderline: {
          position: 'absolute',
          bottom: 0,
          height: Stroke.emphasis,
          backgroundColor: colors.brand,
          borderRadius: Stroke.emphasis },
        // ── Effect section header (label + enable toggle) ──
        effectSectionHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between' },
        enableToggle: {
          width: Control.hit,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center' },
        enableToggleActive: {},
        effectControls: {
          gap: Space.sm },
        // ── Color section toggle ──
        colorSectionToggle: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.sm,
          paddingVertical: Space.xs,
          minHeight: 44 },
        colorWell: {
          width: 28,
          height: 28,
          borderRadius: Radius.sm,
          borderWidth: Stroke.hairline,
          borderColor: 'rgba(0,0,0,0.1)' },
        colorWellLabel: {
          fontFamily: Typography.family.medium,
          fontSize: TypographyV2.meta.size,
          flex: 1 },
        // ── Slider label row (track rendered by CreatorSlider) ──
        sliderRow: {
          paddingVertical: Space.xs },
        sliderHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: Space.xxs },
        sliderLabel: {
          fontFamily: Typography.family.regular,
          fontSize: TypographyV2.meta.size },
        sliderValue: {
          fontFamily: Typography.family.medium,
          fontSize: TypographyV2.meta.size,
          fontVariant: ['tabular-nums'] },
        // ── Animation ──
        animContent: {
          gap: Space.sm,
          paddingRight: Space.md,
          position: 'relative' },
        animTab: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.smMd,
          height: Control.hit },
        animTabLabel: {
          fontFamily: Typography.family.medium,
          fontSize: TypographyV2.meta.size },
        // ── Confirm ──
        confirmBtn: {
          backgroundColor: colors.brand,
          borderRadius: Radius.lg,
          height: 50,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Space.xs,
          marginTop: Space.sm },
        confirmBtnDisabled: {
          backgroundColor: colors.surfaceAlt },
        confirmBtnText: {
          fontFamily: FontFamily.semibold,
          fontSize: TypographyV2.bodyStrong.size,
          color: colors.textInverse } }),
    [colors],
  );
}
