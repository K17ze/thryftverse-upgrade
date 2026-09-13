import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import type { SupportedCurrencyCode } from '../../constants/currencies';
import type { HydratedLookTag } from '../look/LookHotspots';
import { tagToReference } from './tagToReference';

export interface LookInspectSheetProps {
  /** The tag being inspected — sheet is visible while non-null. */
  tag: HydratedLookTag | null;
  lookId: string;
  /** Fiat formatter — screen passes useFormattedPrice's formatFromFiat. */
  formatPrice: (price: number, code?: SupportedCurrencyCode) => string;
  onClose: () => void;
  onViewDetails: () => void;
}

/**
 * Tap-to-inspect sheet — shows the tagged product's identity and a
 * "View details" confirmation before navigating to the canonical
 * product detail. Causal slide transition only.
 */
function LookInspectSheetImpl({ tag, lookId, formatPrice, onClose, onViewDetails }: LookInspectSheetProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={tag !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.inspectBackdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close product preview">
        <Pressable
          style={styles.inspectSheet}
          onPress={(e) => e.stopPropagation()}
          accessibilityLabel="Product preview"
        accessibilityRole="button"
        >
          {(() => {
            if (!tag) return null;
            const tagImage = tag.image ?? tag.images?.[0];
            const tagTitle = tag.title ?? tag.label ?? 'Tagged item';
            const ref = tagToReference(tag, lookId);
            return (
              <>
                <View style={styles.inspectHandle} />
                <View style={styles.inspectContent}>
                  <View style={styles.inspectImgWrap}>
                    {tagImage ? (
                      <ExpoImage
                        source={{ uri: tagImage }}
                        style={styles.inspectImg}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        recyclingKey={tagImage}
                      />
                    ) : (
                      <View style={styles.inspectImgEmpty}>
                        <AppIcon name="bag-handle-outline" size={IconSize.xl} color="textMuted" opticalCenter accessible={false} />
                      </View>
                    )}
                    {tag.isSold && <View style={styles.inspectSoldScrim} />}
                  </View>
                  <View style={styles.inspectInfo}>
                    <Text style={styles.inspectTitle} numberOfLines={2}>{tagTitle}</Text>
                    {tag.isSold ? (
                      <Text style={styles.inspectSold}>Sold</Text>
                    ) : typeof tag.price === 'number' ? (
                      <Text style={styles.inspectPrice}>{formatPrice(tag.price, 'GBP')}</Text>
                    ) : null}
                    {tag.label && tag.title && (
                      <Text style={styles.inspectLabel}>{tag.label}</Text>
                    )}
                  </View>
                </View>
                <AnimatedPressable
                  style={[styles.inspectCta, !ref && styles.inspectCtaDisabled]}
                  onPress={onViewDetails}
                  activeOpacity={0.9}
                  disabled={!ref}
                  accessibilityRole="button"
                  accessibilityLabel="View product details"
                >
                  <Text style={styles.inspectCtaText}>
                    {ref ? 'View details' : 'Unavailable'}
                  </Text>
                  <AppIcon name="forward" size={IconSize.sm} color="textInverse" opticalCenter accessible={false} />
                </AnimatedPressable>
              </>
            );
          })()}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const LookInspectSheet = React.memo(LookInspectSheetImpl);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── Inspect sheet ──
    inspectBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end' },
    inspectSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingBottom: Space.lg,
      paddingTop: Space.sm,
      paddingHorizontal: Space.md },
    inspectHandle: {
      width: Space.xl + Space.sm,
      height: Space.xxs,
      borderRadius: Space.xxs,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: Space.md },
    inspectContent: {
      flexDirection: 'row',
      gap: Space.md,
      marginBottom: Space.lg },
    inspectImgWrap: {
      width: Space.xxl + Space.xl,
      height: Space.xxl + Space.xl,
      borderRadius: Radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
      position: 'relative' },
    inspectImg: { width: '100%', height: '100%' },
    inspectImgEmpty: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center' },
    inspectSoldScrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.scrimTextTertiary },
    inspectInfo: { flex: 1, justifyContent: 'center', gap: Space.xs },
    inspectTitle: {
      fontSize: TypographyV2.itemTitle.size,
      fontFamily: TypographyV2.itemTitle.fontFamily,
      color: colors.textPrimary,
      letterSpacing: TypographyV2.itemTitle.letterSpacing },
    inspectPrice: {
      fontSize: TypographyV2.priceList.size,
      fontFamily: TypographyV2.priceList.fontFamily,
      color: colors.brand },
    inspectSold: {
      fontSize: TypographyV2.priceList.size,
      fontFamily: TypographyV2.priceList.fontFamily,
      color: colors.danger },
    inspectLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    inspectCta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs + 2,
      paddingVertical: Space.md - 2,
      borderRadius: Radius.lg,
      backgroundColor: colors.brand },
    inspectCtaDisabled: {
      backgroundColor: colors.surfaceAlt },
    inspectCtaText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textInverse } });
}
