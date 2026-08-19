import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TextInput } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Radius, Type, Space } from '../theme/designTokens';
import { AnimatedPressable } from './AnimatedPressable';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';

const { height, width } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: string[];
  selectedValue?: string;
  onSelect: (value: string) => void;
  searchable?: boolean;
}

export function BottomSheetPicker({ visible, onClose, title, options, selectedValue, onSelect, searchable }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [searchQuery, setSearchQuery] = useState('');
  const [shouldRender, setShouldRender] = useState(visible);
  const translateY = useSharedValue(height);
  const contextY = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  // Derived filtered options
  const filteredOptions = options.filter(o => o?.toLowerCase()?.includes(searchQuery.toLowerCase()) ?? false);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      setSearchQuery('');
      translateY.value = reducedMotion ? withTiming(height * 0.4, { duration: 0 }) : height * 0.4;
    } else if (shouldRender) {
      translateY.value = reducedMotion ? withTiming(height, { duration: 0 }) : height;
      setShouldRender(false);
    }
  }, [shouldRender, visible, reducedMotion]);

  const handleClose = () => {
    translateY.value = reducedMotion ? withTiming(height, { duration: 0 }) : height;
    onClose();
  };

  const handleSelect = (val: string) => {
    onSelect(val);
    handleClose();
  };

  const gesture = Gesture.Pan()
    .onStart(() => {
      contextY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateY.value = Math.max(height * 0.1, contextY.value + e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 80 && e.velocityY > 500) {
        runOnJS(handleClose)();
      } else if (translateY.value > height * 0.7) {
        runOnJS(handleClose)();
      } else {
        translateY.value = reducedMotion ? withTiming(height * 0.4, { duration: 0 }) : height * 0.4;
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => {
    return {
      opacity: visible ? 0.6 : 0,
      display: visible ? 'flex' : 'none',
    };
  });

  if (!shouldRender) {
    return null;
  }

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9999 }]} pointerEvents="box-none">
      <Reanimated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, overlayStyle]}>
        <AnimatedPressable
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          disableAnimation
          onPress={handleClose}
        />
      </Reanimated.View>

      <GestureDetector gesture={gesture}>
        <Reanimated.View style={[styles.sheet, sheetStyle]}>
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          <View style={styles.header}>
            <Text style={styles.headerTitle}>{title}</Text>
          </View>

          {searchable && (
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          )}

          <ScrollView style={styles.scrollList} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {filteredOptions.length === 0 ? (
              <Text style={styles.noResultsText}>No results found</Text>
            ) : (
              filteredOptions.map((opt) => (
                <AnimatedPressable
                  key={opt}
                  style={styles.optionRow}
                  activeOpacity={0.7}
                  onPress={() => handleSelect(opt)}
                >
                  <Text style={[styles.optionText, selectedValue === opt && styles.optionTextActive]}>{opt}</Text>
                  {selectedValue === opt && <Ionicons name="checkmark-circle" size={24} color={colors.brand} />}
                </AnimatedPressable>
              ))
            )}
          </ScrollView>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    width: width,
    height: height,
    backgroundColor: colors.surfaceAlt,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  handleContainer: { alignItems: 'center', paddingVertical: 14 },
  handle: { width: 44, height: 5, borderRadius: Radius.sm, backgroundColor: colors.border },
  header: { alignItems: 'center', marginBottom: 12 },
  headerTitle: { fontSize: Type.priceList.size, fontFamily: Typography.family.semibold, color: colors.textPrimary, letterSpacing: 0.08 },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 0.5,
    borderColor: colors.border,
    marginHorizontal: 20,
    paddingHorizontal: Space.md,
    height: 50,
    borderRadius: Radius.full,
    marginBottom: Space.md,
  },
  searchInput: { flex: 1, marginLeft: 10, color: colors.textPrimary, fontFamily: Typography.family.medium, fontSize: Type.body.size, letterSpacing: 0.08 },

  scrollList: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },

  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  optionText: { fontSize: Type.body.size, fontFamily: Typography.family.medium, color: colors.textPrimary, letterSpacing: 0.08 },
  optionTextActive: { fontFamily: Typography.family.semibold, color: colors.brand },

  noResultsText: { textAlign: 'center', color: colors.textMuted, marginTop: 40, fontFamily: Typography.family.medium },
});