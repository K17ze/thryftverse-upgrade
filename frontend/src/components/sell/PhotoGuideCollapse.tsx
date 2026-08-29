import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Control, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { t } from '../../i18n';

export interface PhotoGuideCollapseProps {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * Collapsible photo guidance section. Flat inline — no card chrome
 * (AGENTS.md §4 surface budget). A pressable header row toggles a
 * short list of photo tips.
 */
function PhotoGuideCollapse({ collapsed, onToggle }: PhotoGuideCollapseProps) {
  const { colors } = useAppTheme();

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.photoGuideHeader, pressed && { opacity: 0.6 }]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={collapsed ? 'Expand photo tips' : 'Collapse photo tips'}
      >
        <Ionicons name="camera-outline" size={16} color={colors.textSecondary} aria-hidden={true} />
        <Text style={[styles.photoGuideTitle, { color: colors.textSecondary }]}>{t('listing.create.photoTips')}</Text>
        <Text style={[styles.photoGuideMin, { color: colors.textMuted }]}>{t('listing.create.photoTipsMin')}</Text>
        <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={12} color={colors.textMuted} aria-hidden={true} />
      </Pressable>
      {!collapsed && (
        <View style={styles.photoGuideTips}>
          <View style={styles.photoGuideTipRow}>
            <Ionicons name="sunny-outline" size={12} color={colors.textMuted} aria-hidden={true} />
            <Text style={[styles.photoGuideTip, { color: colors.textMuted }]}>{t('listing.create.photoTipLighting')}</Text>
          </View>
          <View style={styles.photoGuideTipRow}>
            <Ionicons name="cube-outline" size={12} color={colors.textMuted} aria-hidden={true} />
            <Text style={[styles.photoGuideTip, { color: colors.textMuted }]}>{t('listing.create.photoTipAngles')}</Text>
          </View>
          <View style={styles.photoGuideTipRow}>
            <Ionicons name="leaf-outline" size={12} color={colors.textMuted} aria-hidden={true} />
            <Text style={[styles.photoGuideTip, { color: colors.textMuted }]}>{t('listing.create.photoTipBackground')}</Text>
          </View>
        </View>
      )}
    </>
  );
}

export default PhotoGuideCollapse;

const styles = StyleSheet.create({
  photoGuideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    minHeight: Control.hit },
  photoGuideTitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing },
  photoGuideMin: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing },
  photoGuideTips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm + 2,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm },
  photoGuideTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  photoGuideTip: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing } });
