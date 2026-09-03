/**
 * Text Component System
 * Replace ALL inline fontSize with these components
 * Based on Instagram/Depop typography patterns
 */

import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet, StyleProp, TextStyle } from 'react-native';
import {} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { useAccessibilityPreferences } from '../../context/AccessibilityPreferencesContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';

interface TextComponentProps extends RNTextProps {
  children: React.ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

/**
 * Returns a font-size multiplier derived from the user's in-app text size
 * preference. This is applied ON TOP of the OS-level font scale that RN
 * handles natively via `maxFontSizeMultiplier`. The product of the two
 * scales allows users to reach 200%+ effective text size when both the
 * OS setting and the in-app setting are maxed out.
 */
function useTextSizeMultiplier(): number {
  const { textSizeScale } = useAccessibilityPreferences();
  return textSizeScale;
}

// ============================================================================
// CAPTIONS (12px)
// ============================================================================

export const Caption: React.FC<TextComponentProps> = ({
  children,
  color,
  style,
  ...props
}) => {
  const { colors } = useAppTheme();
  const scale = useTextSizeMultiplier();
  return (
    <RNText
      maxFontSizeMultiplier={1.8}
      style={[
        styles.caption,
        { color: color ?? colors.textSecondary },
        scale !== 1 ? { fontSize: Math.round(TypographyV2.meta.size * scale), lineHeight: Math.round(TypographyV2.meta.lineHeight * scale) } : undefined,
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
};

export const CaptionEmphasis: React.FC<TextComponentProps> = ({
  children,
  color,
  style,
  ...props
}) => {
  const { colors } = useAppTheme();
  const scale = useTextSizeMultiplier();
  return (
    <RNText
      maxFontSizeMultiplier={1.8}
      style={[
        styles.captionEmphasis,
        { color: color ?? colors.textPrimary },
        scale !== 1 ? { fontSize: Math.round(TypographyV2.meta.size * scale), lineHeight: Math.round(TypographyV2.meta.lineHeight * scale) } : undefined,
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
};

// ============================================================================
// BODY TEXT (14px)
// ============================================================================

export const Body: React.FC<TextComponentProps> = ({
  children,
  color,
  style,
  ...props
}) => {
  const { colors } = useAppTheme();
  const scale = useTextSizeMultiplier();
  return (
    <RNText
      maxFontSizeMultiplier={2}
      style={[
        styles.body,
        { color: color ?? colors.textPrimary },
        scale !== 1 ? { fontSize: Math.round(TypographyV2.body.size * scale), lineHeight: Math.round(TypographyV2.body.lineHeight * scale) } : undefined,
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
};

export const BodyEmphasis: React.FC<TextComponentProps> = ({
  children,
  color,
  style,
  ...props
}) => {
  const { colors } = useAppTheme();
  const scale = useTextSizeMultiplier();
  return (
    <RNText
      maxFontSizeMultiplier={2}
      style={[
        styles.bodyEmphasis,
        { color: color ?? colors.textPrimary },
        scale !== 1 ? { fontSize: Math.round(TypographyV2.priceList.size * scale), lineHeight: Math.round(TypographyV2.priceList.lineHeight * scale) } : undefined,
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
};

// ============================================================================
// HEADLINES (17px - iOS style)
// ============================================================================

export const Headline: React.FC<TextComponentProps> = ({
  children,
  color,
  style,
  ...props
}) => {
  const { colors } = useAppTheme();
  const scale = useTextSizeMultiplier();
  return (
    <RNText
      maxFontSizeMultiplier={1.5}
      style={[
        styles.headline,
        { color: color ?? colors.textPrimary },
        scale !== 1 ? { fontSize: Math.round(TypographyV2.sectionTitle.size * scale), lineHeight: Math.round(TypographyV2.sectionTitle.lineHeight * scale) } : undefined,
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
};

// ============================================================================
// TITLES (20px, 24px, 32px)
// ============================================================================

export const Title3: React.FC<TextComponentProps> = ({
  children,
  color,
  style,
  ...props
}) => {
  const { colors } = useAppTheme();
  const scale = useTextSizeMultiplier();
  return (
    <RNText
      maxFontSizeMultiplier={1.5}
      style={[
        styles.title3,
        { color: color ?? colors.textPrimary },
        scale !== 1 ? { fontSize: Math.round(TypographyV2.screenTitle.size * scale), lineHeight: Math.round(TypographyV2.screenTitle.lineHeight * scale) } : undefined,
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
};

export const Title2: React.FC<TextComponentProps> = ({
  children,
  color,
  style,
  ...props
}) => {
  const { colors } = useAppTheme();
  const scale = useTextSizeMultiplier();
  return (
    <RNText
      maxFontSizeMultiplier={1.5}
      style={[
        styles.title2,
        { color: color ?? colors.textPrimary },
        scale !== 1 ? { fontSize: Math.round(TypographyV2.screenTitle.size * scale), lineHeight: Math.round(TypographyV2.screenTitle.lineHeight * scale) } : undefined,
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
};

export const Title1: React.FC<TextComponentProps> = ({
  children,
  color,
  style,
  ...props
}) => {
  const { colors } = useAppTheme();
  const scale = useTextSizeMultiplier();
  return (
    <RNText
      maxFontSizeMultiplier={1.5}
      style={[
        styles.title1,
        { color: color ?? colors.textPrimary },
        scale !== 1 ? { fontSize: Math.round(TypographyV2.screenTitle.size * scale), lineHeight: Math.round(TypographyV2.screenTitle.lineHeight * scale) } : undefined,
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
};

// ============================================================================
// SPECIALTY TEXT
// ============================================================================

interface PriceProps extends Omit<TextComponentProps, 'children'> {
  amount: number;
  currency?: string;
}

export const Price: React.FC<PriceProps> = ({
  amount,
  currency,
  color,
  style,
  ...props
}) => {
  const { colors } = useAppTheme();
  const { currencySymbol } = useFormattedPrice();
  const scale = useTextSizeMultiplier();
  return (
    <RNText
      maxFontSizeMultiplier={1.5}
      style={[
        styles.price,
        { color: color ?? colors.textPrimary },
        scale !== 1 ? { fontSize: Math.round(TypographyV2.priceList.size * scale), lineHeight: Math.round(TypographyV2.priceList.lineHeight * scale) } : undefined,
        style,
      ]}
      {...props}
    >
      {currency ?? currencySymbol}{amount.toFixed(2)}
    </RNText>
  );
};

export const PriceCompact: React.FC<PriceProps> = ({
  amount,
  currency,
  color,
  style,
  ...props
}) => {
  const { colors } = useAppTheme();
  const { currencySymbol } = useFormattedPrice();
  const scale = useTextSizeMultiplier();
  return (
    <RNText
      maxFontSizeMultiplier={1.5}
      style={[
        styles.priceCompact,
        { color: color ?? colors.textPrimary },
        scale !== 1 ? { fontSize: Math.round(TypographyV2.meta.size * scale), lineHeight: Math.round(TypographyV2.meta.lineHeight * scale) } : undefined,
        style,
      ]}
      {...props}
    >
      {currency ?? currencySymbol}{amount.toFixed(0)}
    </RNText>
  );
};

export const PriceLarge: React.FC<PriceProps> = ({
  amount,
  currency,
  color,
  style,
  ...props
}) => {
  const { colors } = useAppTheme();
  const { currencySymbol } = useFormattedPrice();
  const scale = useTextSizeMultiplier();
  return (
    <RNText
      maxFontSizeMultiplier={1.5}
      style={[
        styles.priceLarge,
        { color: color ?? colors.textPrimary },
        scale !== 1 ? { fontSize: Math.round(TypographyV2.priceHero.size * scale), lineHeight: Math.round(TypographyV2.priceHero.lineHeight * scale) } : undefined,
        style,
      ]}
      {...props}
    >
      {currency ?? currencySymbol}{amount.toFixed(2)}
    </RNText>
  );
};

// ============================================================================
// META - Small metadata text (ELEVATED)
// ============================================================================

export const Meta: React.FC<TextComponentProps> = ({
  children,
  color,
  style,
  ...props
}) => {
  const { colors } = useAppTheme();
  const scale = useTextSizeMultiplier();
  return (
    <RNText
      maxFontSizeMultiplier={1.8}
      style={[
        styles.meta,
        { color: color ?? colors.textSecondary },
        scale !== 1 ? { fontSize: Math.round(TypographyV2.meta.size * scale), lineHeight: Math.round(TypographyV2.meta.lineHeight * scale) } : undefined,
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  caption: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  captionEmphasis: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  body: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing },
  bodyEmphasis: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: TypographyV2.priceList.fontFamily,
    letterSpacing: TypographyV2.priceList.letterSpacing },
  headline: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  title3: {
    fontSize: TypographyV2.screenTitle.size,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    letterSpacing: TypographyV2.screenTitle.letterSpacing },
  title2: {
    fontSize: TypographyV2.screenTitle.size,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    letterSpacing: TypographyV2.screenTitle.letterSpacing },
  title1: {
    fontSize: TypographyV2.screenTitle.size,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    letterSpacing: TypographyV2.screenTitle.letterSpacing },
  price: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: TypographyV2.priceList.fontFamily,
    letterSpacing: 0 },
  priceCompact: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0 },
  priceLarge: {
    fontSize: TypographyV2.priceHero.size,
    lineHeight: TypographyV2.priceHero.lineHeight,
    fontFamily: TypographyV2.priceHero.fontFamily,
    letterSpacing: TypographyV2.priceHero.letterSpacing },
  meta: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing } });

// ============================================================================
// NAMESPACE EXPORT (Convenience)
// ============================================================================

export const T = {
  Caption,
  CaptionEmphasis,
  Body,
  BodyEmphasis,
  Headline,
  Title3,
  Title2,
  Title1,
  Price,
  PriceCompact,
  PriceLarge,
  Meta };

export default T;
