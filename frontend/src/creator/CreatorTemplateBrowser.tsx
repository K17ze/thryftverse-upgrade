import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  FlatList,
  Alert,
  Dimensions,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import {
  getTemplatesByCategory,
  TEMPLATE_CATEGORIES,
  type CreatorTemplate,
  type TemplateCategory,
} from './templates';
import { CreatorCanvas } from './CreatorCanvas';
import { SheetContainer, PressScale } from './CreatorAnimations';
import { useHaptic } from '../hooks/useHaptic';

const { width: SCREEN_W } = Dimensions.get('window');

export interface CreatorTemplateBrowserProps {
  visible: boolean;
  documentType: 'look' | 'poster';
  onClose: () => void;
  onApply: (template: CreatorTemplate) => void;
  hasExistingWork: boolean;
}

/**
 * Instagram-grade template browser:
 * - Category filter chips at top (All, Featured, Interactive, Story, etc.)
 * - Featured templates get larger preview cards
 * - Real canvas previews, not flat placeholder cards
 * - Smooth haptic feedback on category change
 */
export function CreatorTemplateBrowser({
  visible,
  documentType,
  onClose,
  onApply,
  hasExistingWork,
}: CreatorTemplateBrowserProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');

  const templates = useMemo(
    () => getTemplatesByCategory(documentType, activeCategory),
    [documentType, activeCategory],
  );

  const featuredTemplates = useMemo(
    () => templates.filter((t) => t.category === 'featured'),
    [templates],
  );

  const standardTemplates = useMemo(
    () => templates.filter((t) => t.category !== 'featured'),
    [templates],
  );

  const handleApply = useCallback(
    (template: CreatorTemplate) => {
      if (hasExistingWork) {
        Alert.alert(
          'Replace current work?',
          `Applying "${template.name}" will replace your current canvas. This cannot be undone.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Replace',
              style: 'destructive',
              onPress: () => {
                onApply(template);
                onClose();
              },
            },
          ],
        );
      } else {
        onApply(template);
        onClose();
      }
    },
    [hasExistingWork, onApply, onClose],
  );

  const handleCategoryChange = useCallback((cat: TemplateCategory | 'all') => {
    haptic.selection();
    setActiveCategory(cat);
  }, [haptic]);

  const renderFeaturedItem = useCallback(
    ({ item }: { item: CreatorTemplate }) => {
      const previewDoc = item.build();
      const previewWidth = SCREEN_W * 0.42;
      const previewHeight = Math.floor(previewWidth / previewDoc.canvas.aspectRatio);

      return (
        <Pressable
          onPress={() => handleApply(item)}
          style={styles.featuredCard}
          accessibilityLabel={`Apply featured template ${item.name}`}
          accessibilityRole="button"
        >
          <View style={styles.featuredPreviewWrap}>
            <CreatorCanvas
              document={previewDoc}
              page={previewDoc.pages[0]}
              canvasWidth={previewWidth}
              canvasHeight={previewHeight}
              mode="preview"
            />
            <View style={styles.featuredBadge}>
              <Ionicons name="star" size={10} color="#1a1a1a" />
              <Text style={styles.featuredBadgeText}>Featured</Text>
            </View>
          </View>
          <Text style={styles.featuredName}>{item.name}</Text>
          <Text style={styles.featuredDesc} numberOfLines={1}>{item.description}</Text>
        </Pressable>
      );
    },
    [handleApply, styles],
  );

  const renderStandardItem = useCallback(
    ({ item }: { item: CreatorTemplate }) => {
      const previewDoc = item.build();
      const previewWidth = 140;
      const previewHeight = Math.floor(previewWidth / previewDoc.canvas.aspectRatio);

      return (
        <Pressable
          onPress={() => handleApply(item)}
          style={styles.templateCard}
          accessibilityLabel={`Apply template ${item.name}`}
          accessibilityRole="button"
        >
          <View style={styles.previewContainer}>
            <CreatorCanvas
              document={previewDoc}
              page={previewDoc.pages[0]}
              canvasWidth={previewWidth}
              canvasHeight={previewHeight}
              mode="preview"
            />
          </View>
          <Text style={styles.templateName}>{item.name}</Text>
          <Text style={styles.templateDesc} numberOfLines={1}>{item.description}</Text>
        </Pressable>
      );
    },
    [handleApply, styles],
  );

  return (
    <SheetContainer visible={visible} onClose={onClose} maxHeight={0.88}>
      <View style={styles.header}>
        <Text style={styles.title}>Templates</Text>
        <PressScale
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityLabel="Close templates"
        >
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </PressScale>
      </View>

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryScroll}
      >
        {TEMPLATE_CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat.key;
          return (
            <Pressable
              key={cat.key}
              onPress={() => handleCategoryChange(cat.key)}
              style={[styles.categoryChip, isActive && styles.categoryChipActive, isActive && { backgroundColor: colors.brand }]}
              accessibilityLabel={`Filter by ${cat.label}`}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive, isActive && { color: colors.textInverse }]}>
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={standardTemplates}
        keyExtractor={(item) => item.id}
        renderItem={renderStandardItem}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        ListHeaderComponent={
          featuredTemplates.length > 0 ? (
            <View style={styles.featuredSection}>
              <Text style={styles.sectionLabel}>Featured</Text>
              <FlatList
                data={featuredTemplates}
                keyExtractor={(item) => item.id}
                renderItem={renderFeaturedItem}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.featuredScroll}
              />
              <Text style={styles.sectionLabel}>All Templates</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="grid-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>No templates in this category</Text>
          </View>
        }
      />
    </SheetContainer>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  // ── Category chips ──
  categoryScroll: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    gap: Space.xs,
  },
  categoryChip: {
    paddingHorizontal: Space.md + 2,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    marginRight: Space.xs,
  },
  categoryChipActive: {
    // backgroundColor set inline via colors.brand
  },
  categoryChipText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
    color: colors.textSecondary,
  },
  categoryChipTextActive: {
    fontFamily: Typography.family.semibold,
    // color set inline via colors.textInverse
  },
  // ── Featured section ──
  featuredSection: {
    marginBottom: Space.md,
  },
  sectionLabel: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    color: colors.textPrimary,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  featuredScroll: {
    paddingHorizontal: Space.md,
    gap: Space.md,
    paddingBottom: Space.sm,
  },
  featuredCard: {
    width: SCREEN_W * 0.42,
  },
  featuredPreviewWrap: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Space.xs,
    position: 'relative',
  },
  featuredBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(201,164,106,0.95)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  featuredBadgeText: {
    fontFamily: Typography.family.semibold,
    fontSize: 9,
    color: '#1a1a1a',
    letterSpacing: 0.3,
  },
  featuredName: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    color: colors.textPrimary,
    marginBottom: 1,
  },
  featuredDesc: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size - 1,
    color: colors.textMuted,
  },
  // ── Standard grid ──
  listContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.lg,
  },
  columnWrapper: {
    gap: Space.md,
    marginBottom: Space.md,
  },
  templateCard: {
    flex: 1,
  },
  previewContainer: {
    alignItems: 'center',
    marginBottom: Space.xs,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  templateName: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size - 1,
    color: colors.textPrimary,
    marginBottom: 1,
  },
  templateDesc: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size - 1,
    color: colors.textMuted,
    lineHeight: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Space.xl * 2,
    gap: Space.sm,
  },
  emptyText: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    color: colors.textSecondary,
  },
  });
}
