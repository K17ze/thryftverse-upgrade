/**
 * Text Component System
 * Replace ALL inline fontSize with these components
 * Based on Instagram/Depop typography patterns
 */

import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { Type, Typography } from '../../theme/designTokens';
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
        scale !== 1 ? { fontSize: Math.round(Type.caption.size * scale), lineHeight: Math.round(Type.caption.lineHeight * scale) } : undefined,
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
        scale !== 1 ? { fontSize: Math.round(Type.caption.size * scale), lineHeight: Math.round(Type.caption.lineHeight * scale) } : undefined,
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
        scale !== 1 ? { fontSize: Math.round(Type.body.size * scale), lineHeight: Math.round(Type.body.lineHeight * scale) } : undefined,
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
        scale !== 1 ? { fontSize: Math.round(Type.priceList.size * scale), lineHeight: Math.round(Type.priceList.lineHeight * scale) } : undefined,
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
        scale !== 1 ? { fontSize: Math.round(Type.subtitle.size * scale), lineHeight: Math.round(Type.subtitle.lineHeight * scale) } : undefined,
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
        scale !== 1 ? { fontSize: Math.round(Type.title.size * scale), lineHeight: Math.round(Type.title.lineHeight * scale) } : undefined,
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
        scale !== 1 ? { fontSize: Math.round(Type.title.size * scale), lineHeight: Math.round(Type.title.lineHeight * scale) } : undefined,
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
        scale !== 1 ? { fontSize: Math.round(Type.title.size * scale), lineHeight: Math.round(Type.title.lineHeight * scale) } : undefined,
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
        scale !== 1 ? { fontSize: Math.round(Type.priceList.size * scale), lineHeight: Math.round(Type.priceList.lineHeight * scale) } : undefined,
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
        scale !== 1 ? { fontSize: Math.round(Type.caption.size * scale), lineHeight: Math.round(Type.caption.lineHeight * scale) } : undefined,
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
        scale !== 1 ? { fontSize: Math.round(Type.priceHero.size * scale), lineHeight: Math.round(Type.priceHero.lineHeight * scale) } : undefined,
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
        scale !== 1 ? { fontSize: Math.round(Type.meta.size * scale), lineHeight: Math.round(Type.meta.lineHeight * scale) } : undefined,
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
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  captionEmphasis: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
  },
  body: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  bodyEmphasis: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.priceList.letterSpacing,
  },
  headline: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  title3: {
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.title.letterSpacing,
  },
  title2: {
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.title.letterSpacing,
  },
  title1: {
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.title.letterSpacing,
  },
  price: {
    fontSize: Type.priceList.size,
    lineHeight: Type.priceList.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: 0,
  },
  priceCompact: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0,
  },
  priceLarge: {
    fontSize: Type.priceHero.size,
    lineHeight: Type.priceHero.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceHero.letterSpacing,
  },
  meta: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
  },
});

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
  Meta,
};

export default T;
