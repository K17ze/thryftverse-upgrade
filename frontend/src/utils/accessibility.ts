import { PixelRatio, Dimensions, AccessibilityInfo } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Minimum touch target sizes (WCAG 2.5.5)
export const MIN_TOUCH_TARGET = {
  default: 44, // 44x44pt minimum
  critical: 48, // 48x48pt for critical actions
};

// Spacing between touch targets
export const MIN_TOUCH_SPACING = 8;

/**
 * Get scaled font size based on user's accessibility settings
 * @param baseSize - Base font size
 * @returns Scaled font size
 */
export function getScaledFontSize(baseSize: number): number {
  const fontScale = PixelRatio.getFontScale();
  return Math.round(baseSize * fontScale);
}

/**
 * Check if large text mode is enabled
 */
export async function isLargeTextEnabled(): Promise<boolean> {
  return AccessibilityInfo.isBoldTextEnabled?.() || Promise.resolve(false);
}

/**
 * Touch target enforcement
 * Ensures minimum 44x44pt for all interactive elements
 */
export function enforceTouchTarget(
  size: number,
  isCritical: boolean = false
): number {
  const min = isCritical ? MIN_TOUCH_TARGET.critical : MIN_TOUCH_TARGET.default;
  return Math.max(size, min);
}

/**
 * Accessible touch target style
 */
export function accessibleTouchTarget(
  isCritical: boolean = false
): { width: number; height: number } {
  const size = isCritical ? MIN_TOUCH_TARGET.critical : MIN_TOUCH_TARGET.default;
  return { width: size, height: size };
}

/**
 * Calculate contrast ratio between two colors
 * Returns ratio from 1:1 to 21:1
 * WCAG requires 4.5:1 for normal text, 3:1 for large text
 */
export function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

/**
 * Calculate relative luminance of a color
 */
function getLuminance(color: string): number {
  const rgb = hexToRgb(color);
  if (!rgb) return 0;

  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Convert hex to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Check if color combination meets WCAG contrast requirements
 * @param foreground - Text color
 * @param background - Background color
 * @param isLargeText - Whether text is 18pt+ or 14pt+ bold
 */
export function meetsContrastRequirements(
  foreground: string,
  background: string,
  isLargeText: boolean = false
): boolean {
  const ratio = getContrastRatio(foreground, background);
  return isLargeText ? ratio >= 3 : ratio >= 4.5;
}

/**
 * Accessibility props helper for components
 */
export function getAccessibilityProps(
  label: string,
  hint?: string,
  role?: 'button' | 'link' | 'header' | 'image' | 'text'
): {
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link' | 'header' | 'image' | 'text';
} {
  return {
    accessibilityLabel: label,
    ...(hint && { accessibilityHint: hint }),
    ...(role && { accessibilityRole: role }),
  };
}

/**
 * Common accessibility labels for reuse
 */
export const accessibilityLabels = {
  // Navigation
  home: 'Home',
  search: 'Search',
  sell: 'Sell',
  inbox: 'Inbox',
  profile: 'Profile',

  // Actions
  like: 'Like',
  unlike: 'Unlike',
  save: 'Save',
  unsave: 'Remove from saved',
  share: 'Share',
  more: 'More options',

  // Product
  productImage: 'Product image',
  sellerAvatar: 'Seller avatar',
  price: 'Price',

  // Profile
  editProfile: 'Edit profile',
  changePhoto: 'Change profile photo',
  followers: 'Followers',
  following: 'Following',
} as const;