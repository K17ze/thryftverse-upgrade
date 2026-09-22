/**
 * GalleriaEditorialScreen — the readable article destination for a Galleria
 * editorial piece (S21-02).
 *
 * Route param is the editorial's ID, not a teaser echo: the screen resolves
 * the piece and renders its full body (`GalleriaEditorial.content`, sourced
 * from the backend `body_content` column). A removed/unpublished piece gets
 * an honest unavailable state with a way back to the Galleria — never a
 * spinner that never settles and never the same teaser re-presented as the
 * article.
 *
 * Resolution goes through `GET /galleria/editorials/:id`, which disambiguates
 * genuinely missing/unpublished pieces (404 → unavailable state) from pieces
 * beyond the list endpoint's first page — a deep link to an older published
 * piece must render the article, not a false "no longer available".
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, FontFamily } from '../theme/designTokens';
import { TypographyV2, MAX_FONT_SCALE } from '../theme/typography.v2';
import { CachedImage } from '../components/CachedImage';
import {
  FlagshipScreen,
  FlagshipHeader,
  FlagshipState } from '../components/flagship';
import { fetchGalleriaEditorial, type GalleriaEditorial } from '../services/galleriaApi';
import { formatLongDate } from '../utils/dateFormat';

type Props = NativeStackScreenProps<RootStackParamList, 'GalleriaEditorial'>;

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'ready'; editorial: GalleriaEditorial };

export default function GalleriaEditorialScreen({ navigation, route }: Props) {
  const { editorialId } = route.params;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchGalleriaEditorial(editorialId)
      .then((editorial) => {
        if (cancelled) return;
        setState(
          editorial
            ? { status: 'ready', editorial }
            : { status: 'missing' },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [editorialId]);

  useEffect(() => load(), [load]);

  const header = (
    <FlagshipHeader
      title="Galleria"
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      showBackButton={navigation.canGoBack()}
    />
  );

  if (state.status === 'loading') {
    // Quiet loading frame — reserves the article silhouette (hero band,
    // title block, body lines) so the transition in doesn't jump.
    return (
      <FlagshipScreen scrollEnabled={false} contentStyle={styles.stateContent} header={header}>
        <View style={styles.skeletonHero} />
        <View style={styles.skeletonTitle} />
        <View style={[styles.skeletonLine, { width: '92%' }]} />
        <View style={[styles.skeletonLine, { width: '78%' }]} />
        <View style={[styles.skeletonLine, { width: '85%' }]} />
      </FlagshipScreen>
    );
  }

  if (state.status === 'error') {
    return (
      <FlagshipScreen scrollEnabled={false} contentStyle={styles.stateContent} header={header}>
        <FlagshipState
          variant="error"
          icon="cloud-offline-outline"
          title="Story unavailable"
          subtitle="We couldn't load this editorial. Check your connection and try again."
          actionLabel="Retry"
          onAction={load}
        />
      </FlagshipScreen>
    );
  }

  if (state.status === 'missing') {
    // The piece was removed or unpublished — say so and offer a real next
    // step rather than dumping the user on a dead screen.
    return (
      <FlagshipScreen scrollEnabled={false} contentStyle={styles.stateContent} header={header}>
        <FlagshipState
          variant="empty"
          icon="newspaper-outline"
          title="This story is no longer available"
          subtitle="It may have been removed or unpublished by our editors."
          actionLabel="Explore the Galleria"
          onAction={() => navigation.navigate('Galleria')}
        />
      </FlagshipScreen>
    );
  }

  const { editorial } = state;
  const publishedLabel = formatLongDate(editorial.publishedAt);
  const byline = [editorial.readTime, publishedLabel].filter(Boolean).join(' · ');

  return (
    <FlagshipScreen header={header} contentStyle={styles.articleContent} respectBottomInset>
      {/* Hero — the piece's own art, full-bleed within the content column. */}
      {editorial.heroImage ? (
        <CachedImage
          uri={editorial.heroImage}
          style={styles.hero}
          contentFit="cover"
          priority="high"
        />
      ) : null}

      <Text style={styles.eyebrow} maxFontSizeMultiplier={MAX_FONT_SCALE.utility}>
        EDITORIAL
      </Text>
      <Text style={styles.title} maxFontSizeMultiplier={MAX_FONT_SCALE.content}>
        {editorial.title}
      </Text>

      {/* Standfirst — the same excerpt that sold the tap, set as the lede. */}
      {editorial.excerpt ? (
        <Text style={styles.standfirst} maxFontSizeMultiplier={MAX_FONT_SCALE.content}>
          {editorial.excerpt}
        </Text>
      ) : null}

      <View style={styles.bylineRow}>
        {editorial.authorAvatar ? (
          <CachedImage
            uri={editorial.authorAvatar}
            style={styles.bylineAvatar}
            contentFit="cover"
          />
        ) : null}
        <View style={styles.bylineTextCol}>
          <Text style={styles.bylineAuthor} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.heading}>
            {editorial.author}
          </Text>
          {byline ? (
            <Text style={styles.bylineMeta} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.utility}>
              {byline}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.bodyDivider} />

      {/* Body — real paragraphs from the editorial record, full content
          scaling. When a piece carries no body, the standfirst above is all
          there is; nothing is padded or fabricated. */}
      {editorial.content.map((paragraph, index) => (
        <Text
          key={`${editorial.id}-p${index}`}
          style={styles.paragraph}
          maxFontSizeMultiplier={MAX_FONT_SCALE.content}
        >
          {paragraph}
        </Text>
      ))}
    </FlagshipScreen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  stateContent: {
    flex: 1,
    paddingTop: Space.lg,
  },
  skeletonHero: {
    height: 220,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    marginBottom: Space.lg,
  },
  skeletonTitle: {
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
    marginBottom: Space.md,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    marginBottom: Space.sm,
  },
  articleContent: {
    paddingTop: Space.sm,
  },
  hero: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 12,
    marginBottom: Space.md,
  },
  eyebrow: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.label.letterSpacing,
    color: colors.textMuted,
    marginBottom: Space.xs,
  },
  title: {
    fontSize: TypographyV2.editorialDisplay.size,
    lineHeight: TypographyV2.editorialDisplay.lineHeight,
    fontFamily: TypographyV2.editorialDisplay.fontFamily,
    letterSpacing: TypographyV2.editorialDisplay.letterSpacing,
    color: colors.textPrimary,
    marginBottom: Space.sm,
  },
  standfirst: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight + 4,
    fontFamily: FontFamily.regular,
    color: colors.textSecondary,
    marginBottom: Space.md,
  },
  bylineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.md,
  },
  bylineAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
  },
  bylineTextCol: {
    flexShrink: 1,
  },
  bylineAuthor: {
    fontSize: TypographyV2.captionElevated.size,
    fontFamily: FontFamily.medium,
    color: colors.textPrimary,
  },
  bylineMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    color: colors.textMuted,
    marginTop: 2,
  },
  bodyDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: Space.md,
  },
  paragraph: {
    fontSize: TypographyV2.body.size + 2,
    lineHeight: TypographyV2.body.lineHeight + 8,
    fontFamily: FontFamily.regular,
    color: colors.textPrimary,
    marginBottom: Space.md,
  },
});
