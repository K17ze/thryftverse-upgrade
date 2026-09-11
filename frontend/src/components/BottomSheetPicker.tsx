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
import { useAppTranslation } from '../i18n/useAppTranslation';

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
  const { colors, isDark } = useAppTheme();
  const { t } = useAppTranslation('common');
  const { height, width } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, isDark, width, height), [colors, isDark, width, height]);
  const [searchQuery, setSearchQuery] = useState('');
  const [shouldRender, setShouldRender] = useState(visible);
  const translateY = useSharedValue(height);
  const overlayOpacity = useSharedValue(0);
  const contextY = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  // Derived filtered options
  const filteredOptions = options.filter(o => o?.toLowerCase()?.includes(searchQuery.toLowerCase()) ?? false);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      setSearchQuery('');
      translateY.value = reducedMotion ? withTiming(height * 0.4, { duration: 0 }) : height * 0.4;
      overlayOpacity.value = reducedMotion ? withTiming(1, { duration: 0 }) : withTiming(1, { duration: 240 });
    } else if (shouldRender) {
      translateY.value = reducedMotion ? withTiming(height, { duration: 0 }) : height;
      overlayOpacity.value = reducedMotion ? withTiming(0, { duration: 0 }) : withTiming(0, { duration: 200 });
      setShouldRender(false);
    }
  }, [shouldRender, visible, reducedMotion, height, translateY, overlayOpacity]);

  const handleClose = () => {
    translateY.value = reducedMotion ? withTiming(height, { duration: 0 }) : height;
    overlayOpacity.value = reducedMotion ? withTiming(0, { duration: 0 }) : withTiming(0, { duration: 200 });
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

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    display: overlayOpacity.value > 0 ? 'flex' : 'none',
  }));

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
                placeholder={t('searchPlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          )}

          <ScrollView style={styles.scrollList} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {filteredOptions.length === 0 ? (
              <Text style={styles.noResultsText}>{t('noResults')}</Text>
            ) : (
              filteredOptions.map((opt) => (
                <AnimatedPressable
                  key={opt}
                  style={styles.optionRow}
                  activeOpacity={0.7}
                  onPress={() => handleSelect(opt)}
                  accessibilityRole="button"
                  accessibilityLabel={opt}
                >
                  <Text style={[styles.optionText, selectedValue === opt && styles.optionTextActive]}>{opt}</Text>
                  {selectedValue === opt && <Ionicons name="checkmark-circle" size={24} color={colors.brand} aria-hidden={true} />}
                </AnimatedPressable>
              ))
            )}
          </ScrollView>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean, width: number, height: number) => StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    width: width,
    height: height,
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    ...Elevation.modal },
  handleContainer: { alignItems: 'center', paddingTop: 10, paddingBottom: Space.sm },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: isDark ? colors.border : 'rgba(0,0,0,0.2)',
  },
  header: { alignItems: 'center', marginBottom: 12 },
  headerTitle: { fontSize: TypographyV2.priceList.size, fontFamily: TypographyV2.priceList.fontFamily, color: colors.textPrimary, letterSpacing: 0.08 },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.surface : colors.surfaceAlt,
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle },
  optionText: { fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, color: colors.textPrimary, letterSpacing: 0.08 },
  optionTextActive: { fontFamily: TypographyV2.body.fontFamily, color: colors.brand },

  noResultsText: { textAlign: 'center', color: colors.textMuted, marginTop: 40, fontFamily: TypographyV2.body.fontFamily } });