import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../theme/ThemeContext';
import { CachedImage } from '../CachedImage';
import type { MetricValue } from '../../services/creatorAnalyticsApi';
import { createCreatorAnalyticsStyles } from './creatorAnalyticsStyles';
import { formatCount, formatDelta } from './creatorAnalyticsFormat';

// ── Performance hero — media-anchored ───────────────────────────────
export function CreatorAnalyticsHero({
  views,
  heroThumbnail }: {
  views: MetricValue;
  heroThumbnail: string | null;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createCreatorAnalyticsStyles(colors), [colors]);
  const viewsDelta = formatDelta(views.changeRatio);
  const viewsUp = views.changeRatio !== null && views.changeRatio > 0;
  return (
    <View style={styles.heroWrap}>
      {heroThumbnail ? (
        <View style={styles.heroMediaWrap}>
          <CachedImage
            uri={heroThumbnail}
            style={styles.heroMedia}
            contentFit="cover"
            transition={200}
            priority="high"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)']}
            locations={[0.2, 1.0]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroOverlay}>
            <Text style={styles.heroLabel}>
              Views
            </Text>
            <View style={styles.heroRow}>
              <Text style={styles.heroValue}>
                {formatCount(views.value)}
              </Text>
              {viewsDelta ? (
                <View style={styles.heroDeltaInline}>
                  <Ionicons
                    name={viewsUp ? 'arrow-up' : 'arrow-down'}
                    size={11}
                    color={colors.scrimTextPrimary}
                  />
                  <Text style={styles.heroDeltaInlineText}>
                    {viewsDelta}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      ) : (
        <>
          <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>
            Views
          </Text>
          <View style={styles.heroRow}>
            <Text style={[styles.heroValue, { color: colors.textPrimary }]}>
              {formatCount(views.value)}
            </Text>
            {viewsDelta ? (
              <View style={[
                styles.heroDelta,
                { backgroundColor: viewsUp ? colors.successSubtle : colors.dangerSubtle },
              ]}>
                <Ionicons
                  name={viewsUp ? 'arrow-up' : 'arrow-down'}
                  size={11}
                  color={viewsUp ? colors.success : colors.danger}
                />
                <Text style={[
                  styles.heroDeltaText,
                  { color: viewsUp ? colors.success : colors.danger },
                ]}>
                  {viewsDelta}
                </Text>
              </View>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}
