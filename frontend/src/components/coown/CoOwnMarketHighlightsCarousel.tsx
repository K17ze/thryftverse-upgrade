import React from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../theme/ThemeContext';
import { Radius, Space, Type, Typography } from '../../theme/designTokens';
import { haptics } from '../../utils/haptics';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';

export interface CoOwnMarketHighlight {
  id: string;
  imageUri?: string | null;
  title: string;
  categoryLabel: string;
  unitPriceLabel: string;
  localReferenceLabel: string;
  availabilityLabel: string;
  allocatedPct: number;
  statusLabel: string;
  status: 'open' | 'closed' | 'paused';
  focalPoint?: { x: number; y: number };
}

export interface CoOwnMarketHighlightsCarouselProps {
  items: CoOwnMarketHighlight[];
  onPressItem: (item: CoOwnMarketHighlight) => void;
}

const GAP = 12;

export function CoOwnMarketHighlightsCarousel({
  items,
  onPressItem,
}: CoOwnMarketHighlightsCarouselProps) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const cardWidth = Math.round(Math.min(width * 0.86, 380));
  const cardHeight = Math.round(Math.min(260, Math.max(228, width * 0.63)));
  const interval = cardWidth + GAP;
  const isLooping = items.length > 1;
  const loopItems = React.useMemo(
    () => isLooping ? [...items, ...items, ...items] : items,
    [isLooping, items]
  );
  const initialIndex = isLooping ? items.length : 0;
  const listRef = React.useRef<FlatList<CoOwnMarketHighlight>>(null);
  const activeLogicalIndexRef = React.useRef(0);
  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    if (items.length === 0) return;
    const nextIndex = activeLogicalIndexRef.current >= items.length ? 0 : activeLogicalIndexRef.current;
    activeLogicalIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
    const target = isLooping ? items.length + nextIndex : nextIndex;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: target, animated: false });
    });
  }, [isLooping, items.length]);

  const handleMomentumEnd = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (items.length === 0) return;
    const rawIndex = Math.round(event.nativeEvent.contentOffset.x / interval);
    const logicalIndex = ((rawIndex % items.length) + items.length) % items.length;
    if (logicalIndex !== activeLogicalIndexRef.current) {
      activeLogicalIndexRef.current = logicalIndex;
      setActiveIndex(logicalIndex);
      haptics.selection();
    }

    if (isLooping && (rawIndex < items.length || rawIndex >= items.length * 2)) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({
          index: items.length + logicalIndex,
          animated: false,
        });
      });
    }
  }, [interval, isLooping, items.length]);

  const renderItem = React.useCallback(({ item }: { item: CoOwnMarketHighlight }) => {
    const statusColor = item.status === 'open'
      ? colors.success
      : item.status === 'paused'
        ? colors.warning
        : colors.textMuted;

    return (
      <AnimatedPressable
        onPress={() => onPressItem(item)}
        style={[styles.card, { width: cardWidth, height: cardHeight, backgroundColor: colors.surface }]}
        scaleValue={0.985}
        activeOpacity={0.96}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${item.unitPriceLabel} per unit, ${item.localReferenceLabel}, ${item.availabilityLabel}, ${item.statusLabel}`}
        accessibilityHint="Opens this market"
      >
        <CachedImage
          uri={item.imageUri ?? ''}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={240}
          priority="high"
          emptyLabel={`${item.categoryLabel} · ${item.title}`}
          emptyIcon="diamond-outline"
          focalPoint={item.focalPoint}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.20)', 'rgba(0,0,0,0.78)']}
          locations={[0.35, 0.58, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusText} numberOfLines={1} maxFontSizeMultiplier={1.3}>{item.statusLabel}</Text>
        </View>
        <View style={styles.content}>
          <Text style={styles.category} numberOfLines={1} maxFontSizeMultiplier={1.3}>{item.categoryLabel}</Text>
          <Text style={styles.title} numberOfLines={2} maxFontSizeMultiplier={1.25}>{item.title}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86} maxFontSizeMultiplier={1.25}>{item.unitPriceLabel}</Text>
            <Text style={styles.localReference} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86} maxFontSizeMultiplier={1.25}>{item.localReferenceLabel}</Text>
          </View>
          <View style={styles.footerRow}>
            <View style={styles.availabilityGroup}>
              <Text style={styles.availability} numberOfLines={1} maxFontSizeMultiplier={1.3}>{item.availabilityLabel}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, item.allocatedPct))}%` }]} />
              </View>
            </View>
            <View style={styles.marketAction}>
              <Text style={styles.marketActionText} maxFontSizeMultiplier={1.25}>View market</Text>
              <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
            </View>
          </View>
        </View>
      </AnimatedPressable>
    );
  }, [cardHeight, cardWidth, colors, onPressItem]);

  if (items.length === 0) return null;

  return (
    <View accessibilityLabel="Market highlights carousel">
      <FlatList
        ref={listRef}
        data={loopItems}
        renderItem={renderItem}
        horizontal
        initialScrollIndex={initialIndex}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        getItemLayout={(_, index) => ({ length: interval, offset: interval * index, index })}
        contentContainerStyle={styles.contentContainer}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsHorizontalScrollIndicator={false}
        snapToInterval={interval}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollToIndexFailed={({ index }) => {
          listRef.current?.scrollToOffset({ offset: interval * index, animated: false });
        }}
        removeClippedSubviews
        initialNumToRender={Math.min(loopItems.length, 5)}
        windowSize={5}
      />
      <View style={styles.indicatorRow}>
        <Text style={[styles.indicatorText, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>
          {activeIndex + 1} of {items.length}
        </Text>
        {items.length > 1 ? (
          <View style={styles.dots}>
            {items.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.dot,
                  { backgroundColor: index === activeIndex ? colors.textPrimary : colors.border },
                  index === activeIndex && styles.activeDot,
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: Space.md,
  },
  separator: {
    width: GAP,
  },
  card: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  statusBadge: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  content: {
    position: 'absolute',
    left: Space.md,
    right: Space.md,
    bottom: Space.md,
    gap: 4,
  },
  category: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: '#FFFFFF',
    fontSize: Type.title.size,
    lineHeight: 28,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.45,
    maxWidth: '92%',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm,
    minWidth: 0,
  },
  price: {
    color: '#FFFFFF',
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  localReference: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.md,
    marginTop: Space.xs,
  },
  availabilityGroup: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  availability: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  progressFill: {
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.90)',
  },
  marketAction: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.42)',
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  marketActionText: {
    color: '#FFFFFF',
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  indicatorRow: {
    minHeight: 28,
    paddingHorizontal: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  indicatorText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    fontVariant: ['tabular-nums'],
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  activeDot: {
    width: 12,
  },
});
