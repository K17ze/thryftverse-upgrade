/**
 * Text Component System
 * Replace ALL inline fontSize with these components
 * Based on Instagram/Depop typography patterns
 */

import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { Type, Typography } from '../../theme/designTokens';
import { Colors } from '../../constants/colors';

interface TextComponentProps extends RNTextProps {
  children: React.ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

// ============================================================================
// CAPTIONS (12px)
// ============================================================================

export const Caption: React.FC<TextComponentProps> = ({
  children,
  color = Colors.textSecondary,
  style,
  ...props
}) => (
  <RNText
    style={[
      styles.caption,
      { color },
      style,
    ]}
    {...props}
  >
    {children}
  </RNText>
);

export const CaptionEmphasis: React.FC<TextComponentProps> = ({
  children,
  color = Colors.textPrimary,
  style,
  ...props
}) => (
  <RNText
    style={[
      styles.captionEmphasis,
      { color },
      style,
    ]}
    {...props}
  >
    {children}
  </RNText>
);

// ============================================================================
// BODY TEXT (14px)
// ============================================================================

export const Body: React.FC<TextComponentProps> = ({
  children,
  color = Colors.textPrimary,
  style,
  ...props
}) => (
  <RNText
    style={[
      styles.body,
      { color },
      style,
    ]}
    {...props}
  >
    {children}
  </RNText>
);

export const BodyEmphasis: React.FC<TextComponentProps> = ({
  children,
  color = Colors.textPrimary,
  style,
  ...props
}) => (
  <RNText
    style={[
      styles.bodyEmphasis,
      { color },
      style,
    ]}
    {...props}
  >
    {children}
  </RNText>
);

// ============================================================================
// HEADLINES (17px - iOS style)
// ============================================================================

export const Headline: React.FC<TextComponentProps> = ({
  children,
  color = Colors.textPrimary,
  style,
  ...props
}) => (
  <RNText
    style={[
      styles.headline,
      { color },
      style,
    ]}
    {...props}
  >
    {children}
  </RNText>
);

// ============================================================================
// TITLES (20px, 24px, 32px)
// ============================================================================

export const Title3: React.FC<TextComponentProps> = ({
  children,
  color = Colors.textPrimary,
  style,
  ...props
}) => (
  <RNText
    style={[
      styles.title3,
      { color },
      style,
    ]}
    {...props}
  >
    {children}
  </RNText>
);

export const Title2: React.FC<TextComponentProps> = ({
  children,
  color = Colors.textPrimary,
  style,
  ...props
}) => (
  <RNText
    style={[
      styles.title2,
      { color },
      style,
    ]}
    {...props}
  >
    {children}
  </RNText>
);

export const Title1: React.FC<TextComponentProps> = ({
  children,
  color = Colors.textPrimary,
  style,
  ...props
}) => (
  <RNText
    style={[
      styles.title1,
      { color },
      style,
    ]}
    {...props}
  >
    {children}
  </RNText>
);

// ============================================================================
// SPECIALTY TEXT
// ============================================================================

interface PriceProps extends Omit<TextComponentProps, 'children'> {
  amount: number;
  currency?: string;
}

export const Price: React.FC<PriceProps> = ({
  amount,
  currency = '£',
  color = Colors.textPrimary,
  style,
  ...props
}) => (
  <RNText
    style={[
      styles.price,
      { color },
      style,
    ]}
    {...props}
  >
    {currency}{amount.toFixed(2)}
  </RNText>
);

export const PriceCompact: React.FC<PriceProps> = ({
  amount,
  currency = '£',
  color = Colors.textPrimary,
  style,
  ...props
}) => (
  <RNText
    style={[
      styles.priceCompact,
      { color },
      style,
    ]}
    {...props}
  >
    {currency}{amount.toFixed(0)}
  </RNText>
);

export const PriceLarge: React.FC<PriceProps> = ({
  amount,
  currency = '£',
  color = Colors.textPrimary,
  style,
  ...props
}) => (
  <RNText
    style={[
      styles.priceLarge,
      { color },
      style,
    ]}
    {...props}
  >
    {currency}{amount.toFixed(2)}
  </RNText>
);

// ============================================================================
// META - Small metadata text (ELEVATED)
// ============================================================================

export const Meta: React.FC<TextComponentProps> = ({
  children,
  color = Colors.textSecondary,
  style,
  ...props
}) => (
  <RNText
    style={[
      styles.meta,
      { color },
      style,
    ]}
    {...props}
  >
    {children}
  </RNText>
);

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
    fontSize: Type.price.size,
    lineHeight: Type.price.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.price.letterSpacing,
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
    fontFamily: Typography.family.semibold,
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
    fontSize: Type.price.size,
    lineHeight: Type.price.lineHeight,
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
    fontSize: Type.priceLarge.size,
    lineHeight: Type.priceLarge.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.priceLarge.letterSpacing,
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