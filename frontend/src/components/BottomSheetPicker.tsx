import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions, TextInput } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Space, Elevation } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from './AnimatedPressable';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';

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
  const { height, width } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, width, height), [colors, width, height]);
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
  }, [shouldRender, visible, reducedMotion, height]);

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
    transform: [{ translateY: translateY.value }] }));

  const overlayStyle = useAnimatedStyle(() => {
    return {
      opacity: visible ? 0.6 : 0,
      display: visible ? 'flex' : 'none' };
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

const createStyles = (colors: ThemeColors, width: number, height: number) => StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    width: width,
    height: height,
    backgroundColor: colors.surfaceAlt,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    ...Elevation.modal },
  handleContainer: { alignItems: 'center', paddingVertical: 14 },
  handle: { width: 44, height: 5, borderRadius: Radius.sm, backgroundColor: colors.border },
  header: { alignItems: 'center', marginBottom: 12 },
  headerTitle: { fontSize: TypographyV2.priceList.size, fontFamily: TypographyV2.priceList.fontFamily, color: colors.textPrimary, letterSpacing: 0.08 },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginHorizontal: 20,
    paddingHorizontal: Space.md,
    height: 50,
    borderRadius: Radius.full,
    marginBottom: Space.md },
  searchInput: { flex: 1, marginLeft: 10, color: colors.textPrimary, fontFamily: TypographyV2.body.fontFamily, fontSize: TypographyV2.body.size, letterSpacing: 0.08 },

  scrollList: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },

  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border },
  optionText: { fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, color: colors.textPrimary, letterSpacing: 0.08 },
  optionTextActive: { fontFamily: TypographyV2.body.fontFamily, color: colors.brand },

  noResultsText: { textAlign: 'center', color: colors.textMuted, marginTop: 40, fontFamily: TypographyV2.body.fontFamily } });