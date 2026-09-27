import React from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { CachedImage } from '../CachedImage';
import { useGalleriaStyles } from '../../hooks/galleria';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { GalleriaEditorial } from '../../services/galleriaApi';

// ---------------------------------------------------------------------------
// Editorial list item — hero, title, excerpt, author + read time
// Varies size for editorial rhythm: 'large' for the lead story, 'standard' for rest.
// The row is a reading action: `onPress` opens the piece's article screen
// (S21-02). Without a handler it renders non-interactive.
// ---------------------------------------------------------------------------
export const GalleriaEditorialListItem = React.memo(function GalleriaEditorialListItem({
  editorial,
  isLast,
  size = 'standard',
  onPress }: {
  editorial: GalleriaEditorial;
  isLast: boolean;
  size?: 'large' | 'standard';
  onPress?: () => void;
}) {
  const styles = useGalleriaStyles();
  const { t } = useAppTranslation('galleria');
  const { width: SCREEN_W } = useWindowDimensions();
  const heroHeight = size === 'large'
    ? Math.round(SCREEN_W * (5 / 8))
    : Math.round(SCREEN_W * (9 / 16));

  const content = (
    <>
      <View style={[styles.editorialHeroWrap, { height: heroHeight }]}>
        <CachedImage
          uri={editorial.heroImage}
          style={styles.editorialHero}
          contentFit="cover"
          priority="normal"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']}
          style={styles.editorialHeroGradient}
        />
        <View style={styles.editorialHeroOverlay} pointerEvents="none">
          <Text style={styles.editorialReadTime}>{editorial.readTime}</Text>
        </View>
      </View>
      <View style={styles.editorialContent}>
        <Text
          style={[styles.editorialTitle, size === 'large' && styles.editorialTitleLarge]}
          numberOfLines={size === 'large' ? 3 : 2}
        >
          {editorial.title}
        </Text>
        <Text style={styles.editorialExcerpt} numberOfLines={size === 'large' ? 4 : 3}>
          {editorial.excerpt}
        </Text>
        <View style={styles.editorialAuthorRow}>
          <CachedImage
            uri={editorial.authorAvatar}
            style={styles.editorialAvatar}
            contentFit="cover"
          />
          <Text style={styles.editorialAuthor} numberOfLines={1}>
            {editorial.author}
          </Text>
        </View>
      </View>
    </>
  );

  return (
    <View style={[styles.editorialItem, isLast && styles.editorialItemLast]}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          accessibilityRole="button"
          accessibilityLabel={t('accessibility.editorial', { title: editorial.title })}
          accessibilityHint={t('accessibility.editorialHint')}
        >
          {content}
        </Pressable>
      ) : (
        <View
          accessibilityRole="image"
          accessibilityLabel={t('accessibility.editorial', { title: editorial.title })}
        >
          {content}
        </View>
      )}
      {!isLast && <View style={styles.editorialSeparator} />}
    </View>
  );
});
