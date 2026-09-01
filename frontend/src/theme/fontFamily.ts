/**
 * Font Families — Thryftverse Visual System
 * Canonical font family definitions. Extracted to eliminate circular
 * dependencies between designTokens.ts and typography.v2.ts.
 */

export const FontFamily = {
  light: 'Inter_300Light',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

export const FontFamilySerif = {
  regular: 'PlayfairDisplay_400Regular',
  bold: 'PlayfairDisplay_700Bold',
} as const;
