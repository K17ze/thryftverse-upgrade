import React, { forwardRef } from 'react';
import {
  TextInput,
  TextInputProps,
  StyleSheet,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { GlassSurface } from './GlassSurface';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';

interface GlassSearchPillProps extends Omit<TextInputProps, 'style'> {
  containerStyle?: StyleProp<ViewStyle>;
  onFocus?: () => void;
  onBlur?: () => void;
}

const AnimatedGlassSurface = Reanimated.createAnimatedComponent(GlassSurface);

export const GlassSearchPill = forwardRef<TextInput, GlassSearchPillProps>(
  function GlassSearchPill({ containerStyle, onFocus, onBlur, ...rest }, ref) {
    const focused = useSharedValue(0);

    const borderStyle = useAnimatedStyle(() => ({
      borderColor: interpolateColor(
        focused.value,
        [0, 1],
        [Colors.glassBorder, 'rgba(212,175,55,0.30)']
      ) as string,
    }));

    const handleFocus = () => {
      focused.value = withTiming(1, { duration: 200 });
      onFocus?.();
    };

    const handleBlur = () => {
      focused.value = withTiming(0, { duration: 200 });
      onBlur?.();
    };

    return (
      <View style={[styles.wrapper, containerStyle]}>
        <AnimatedGlassSurface
          intensity={25}
          tint="default"
          borderRadius={Radius.full}
          style={[styles.glass, borderStyle]}
          contentStyle={styles.content}
        >
          <Ionicons
            name="search"
            size={18}
            color={Colors.textMuted}
            style={styles.icon}
          />
          <TextInput
            ref={ref}
            {...rest}
            placeholderTextColor={Colors.textMuted}
            style={styles.input}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </AnimatedGlassSurface>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  glass: {
    borderWidth: 0.5,
    borderColor: Colors.glassBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.sm,
  },
  icon: {
    marginLeft: 2,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    paddingVertical: 2,
    letterSpacing: -0.2,
  },
});
