import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { CachedImage } from '../CachedImage';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useHaptic } from '../../hooks/useHaptic';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';

const LOOK_CARD_WIDTH = 120;
const LOOK_CARD_HEIGHT = 160;

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface HomeLookBreakLook {
  id: string;
  mediaUri: string;
  title?: string;
  sellerUsername?: string;
  sellerAvatar?: string;
  taggedCount?: number;
}

export interface HomeLookBreakProps {
  looks: HomeLookBreakLook[];
  windowWidth: number;
}

export function HomeLookBreak({ looks, windowWidth }: HomeLookBreakProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const navigation = useNavigation<NavT>();

  return (
    <View style={[styles.flashListItem, { width: windowWidth }]}>
      <View style={styles.inner}>
        <View style={styles.headerRow}>
          <Text style={styles.headerLabel} maxFontSizeMultiplier={1.4}>
            Looks to shop
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {looks.map((look) => (
            <Pressable
              key={look.id}
              onPress={() => { haptic.light(); navigation.navigate('LookDetail', { lookId: look.id }); }}
              style={styles.lookCard}
              accessibilityRole="button"
              accessibilityLabel={`Open Look${look.title ? ` ${look.title}` : ''}${look.taggedCount ? `, ${look.taggedCount} tagged items` : ''}`}
              accessibilityHint="Opens Look details"
            >
              <CachedImage
                uri={look.mediaUri}
                style={styles.lookImage}
                contentFit="cover"
                downscaleWidth={LOOK_CARD_WIDTH}
              />
              {look.taggedCount && look.taggedCount > 0 ? (
                <View style={styles.taggedBadge}>
                  <Text style={styles.taggedBadgeText} maxFontSizeMultiplier={2}>
                    {look.taggedCount} items
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  flashListItem: {
    paddingHorizontal: Space.xs,
    paddingBottom: Space.sm },
  inner: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.xs },
  headerLabel: {
    fontFamily: TypographyV2.meta.fontFamily,
    fontSize: TypographyV2.meta.size,
    color: colors.textPrimary },
  scrollContent: {
    gap: Space.sm },
  lookCard: {
    width: LOOK_CARD_WIDTH,
    borderRadius: Radius.lg,
    overflow: 'hidden' },
  lookImage: {
    width: LOOK_CARD_WIDTH,
    height: LOOK_CARD_HEIGHT },
  taggedBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: colors.overlay,
    borderRadius: Radius.md,
    paddingHorizontal: 6,
    paddingVertical: Space.xxs },
  taggedBadgeText: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
});
