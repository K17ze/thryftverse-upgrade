import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, DockConstants } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

/** Screen-level styles for SellerHubScreen — extracted to keep the
 *  orchestrator under the 400-LOC charter. */
export function createSellerHubScreenStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingBottom: Space.xxl + DockConstants.singleActionHeight,
    },
    importErrorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginHorizontal: Space.md,
      marginTop: Space.xs,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    importErrorText: { fontSize: TypographyV2.caption.size, fontFamily: FontFamily.regular, flex: 1 },
    resourceErrorBanner: { marginHorizontal: Space.md, marginTop: Space.lg },
  });
}
