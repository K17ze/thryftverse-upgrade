import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, AspectRatio, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export function ProductDetailSkeleton() {
  const { colors } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const heroHeight = Math.min(height * (width < 390 ? 0.54 : 0.58), width / AspectRatio.portrait);
  const block = { backgroundColor: colors.surfaceAlt };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.hero, { height: heroHeight }, block]} />

      <View style={styles.identity}>
        <View style={[styles.line, styles.brand, block]} />
        <View style={[styles.line, styles.title, block]} />
        <View style={[styles.line, styles.price, block]} />
        <View style={[styles.line, styles.meta, block]} />
      </View>

      {/* Elevated trust strip placeholder — matches the new trust chips
          that now sit immediately after the identity and before the
          seller row. Per AGENTS.md §14: skeletons should resemble the
          final layout; this avoids a loading → populated geometry shift. */}
      <View style={styles.trustStrip}>
        <View style={[styles.line, styles.trustChip, block]} />
        <View style={[styles.line, styles.trustChip, block]} />
        <View style={[styles.line, styles.trustChip, block]} />
      </View>

      <View style={[styles.hairline, { backgroundColor: colors.borderSubtle }]} />

      <View style={styles.seller}>
        <View style={[styles.avatar, block]} />
        <View style={styles.sellerCopy}>
          <View style={[styles.line, styles.sellerName, block]} />
          <View style={[styles.line, styles.sellerMeta, block]} />
        </View>
        <View style={[styles.line, styles.sellerAction, block]} />
      </View>

      <View style={[styles.hairline, { backgroundColor: colors.borderSubtle }]} />

      <View style={styles.section}>
        <View style={[styles.line, styles.sectionTitle, block]} />
        <View style={[styles.line, styles.bodyLine, block]} />
        <View style={[styles.line, styles.bodyLineShort, block]} />
      </View>

      {/* Sticky dock skeleton — matches the CommerceDetailStateDock
          geometry at the bottom of the screen. Per AGENTS.md §14:
          skeletons should resemble the final layout to avoid
          loading → populated geometry shift. */}
      <View style={[styles.dock, { backgroundColor: colors.background, borderTopColor: colors.borderSubtle }]}>
        <View style={[styles.line, styles.dockPrice, block]} />
        <View style={[styles.line, styles.dockBtn, block]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1 },
  hero: {
    width: '100%' },
  identity: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.lg,
    gap: Space.sm },
  line: {
    borderRadius: Radius.sm },
  brand: {
    width: 84,
    height: TypographyV2.meta.lineHeight },
  title: {
    width: '84%',
    height: TypographyV2.screenTitle.lineHeight },
  price: {
    width: 112,
    height: TypographyV2.priceHero.lineHeight },
  meta: {
    width: '58%',
    height: TypographyV2.meta.lineHeight },
  hairline: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Space.md },
  trustStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    gap: Space.sm },
  trustChip: {
    width: 96,
    height: TypographyV2.meta.lineHeight,
    borderRadius: Radius.sm },
  seller: {
    minHeight: 76,
    paddingHorizontal: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.full },
  sellerCopy: {
    flex: 1,
    gap: Space.xs },
  sellerName: {
    width: '52%',
    height: TypographyV2.body.lineHeight },
  sellerMeta: {
    width: '68%',
    height: TypographyV2.meta.lineHeight },
  sellerAction: {
    width: 48,
    height: TypographyV2.meta.lineHeight },
  section: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
    gap: Space.sm },
  sectionTitle: {
    width: 128,
    height: TypographyV2.sectionTitle.lineHeight },
  bodyLine: {
    width: '100%',
    height: TypographyV2.body.lineHeight },
  bodyLineShort: {
    width: '78%',
    height: TypographyV2.body.lineHeight },
  dock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth },
  dockPrice: {
    width: 80,
    height: TypographyV2.priceList.lineHeight },
  dockBtn: {
    width: 120,
    height: Control.chrome,
    borderRadius: Radius.sm } });
