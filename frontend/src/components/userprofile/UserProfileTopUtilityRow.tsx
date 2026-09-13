import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Control } from '../../theme/designTokens';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { AnimatedPressable } from '../AnimatedPressable';
import { COVER_HEIGHT } from '../../hooks/userprofile';

interface UserProfileTopUtilityRowProps {
  scrollY: SharedValue<number>;
  collapsedVisible: boolean;
  onBack: () => void;
  onShare: () => void;
  onMore: () => void;
}

/**
 * Top utility controls overlaid on the cover — back, share and more. Fades
 * out on scroll; inert once the collapsed header takes over.
 */
export function UserProfileTopUtilityRow({
  scrollY,
  collapsedVisible,
  onBack,
  onShare,
  onMore,
}: UserProfileTopUtilityRowProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  // On-cover icons: always white regardless of theme. colors.textInverse flips
  // to #000000 in dark mode, making icons invisible on the dark overlay.
  const SCRIM_PRIMARY = colors.scrimTextPrimary;

  const topUtilityStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 80], [1, 0], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [0, 80], [0, -8], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateY }] };
  });

  return (
    <View pointerEvents="box-none" style={styles.coverActionLayer}>
      <Reanimated.View
        style={[styles.topUtilityRow, { top: Math.max(insets.top + 6, 14) }, topUtilityStyle]}
        pointerEvents={collapsedVisible ? 'none' : 'auto'}
      >
        <AnimatedPressable
          style={[styles.topUtilityIconBtn, { backgroundColor: colors.overlay }]}
          activeOpacity={0.9}
          onPress={onBack}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          accessibilityHint="Returns to previous screen"
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Ionicons name="arrow-back" size={18} color={SCRIM_PRIMARY} />
        </AnimatedPressable>
        <View style={styles.topUtilityRight}>
          <AnimatedPressable
            style={[styles.topUtilityIconBtn, { backgroundColor: colors.overlay }]}
            activeOpacity={0.9}
            onPress={onShare}
            accessibilityLabel="Share profile"
            accessibilityRole="button"
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Ionicons name="share-outline" size={18} color={SCRIM_PRIMARY} />
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.topUtilityIconBtn, { backgroundColor: colors.overlay }]}
            activeOpacity={0.9}
            onPress={onMore}
            accessibilityLabel="More options"
            accessibilityRole="button"
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={SCRIM_PRIMARY} />
          </AnimatedPressable>
        </View>
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  coverActionLayer: { position: 'absolute', top: 0, left: 0, right: 0, height: COVER_HEIGHT, zIndex: 8 },
  topUtilityRow: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topUtilityRight: { flexDirection: 'row', gap: Space.sm },
  topUtilityIconBtn: {
    width: Control.hit, height: Control.hit, borderRadius: RadiusRoleValue.sheetDialog,
    alignItems: 'center', justifyContent: 'center',
  },
});
