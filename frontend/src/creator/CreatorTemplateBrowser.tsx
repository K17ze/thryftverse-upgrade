import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  FlatList,
  useWindowDimensions,
  ViewStyle,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Space, Radius, Type, Typography, Control, Stroke } from '../theme/designTokens';
import { IconGrammar } from '../theme/designTokens';
import { Motion } from '../theme/motionTokens';
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
import { withAlpha } from '../components/poster/shared/colorUtils';
import { useStore } from '../store/useStore';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { useReducedMotion } from '../hooks/useReducedMotion';



// ── Underline tab for category filtering ────────────────────────────
// Replaces pill-background chips with text-only tabs + 2pt spring-animated
// underline indicator (brand color, Stroke.emphasis).
interface CategoryTabProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  colors: ThemeColors;
}

function CategoryTab({ label, isActive, onPress, colors }: CategoryTabProps) {
  const reducedMotion = useReducedMotion();
  const underlineOpacity = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    underlineOpacity.value = reducedMotion
      ? (isActive ? 1 : 0)
      : withSpring(isActive ? 1 : 0, Motion.spring.indicator);
  }, [isActive, underlineOpacity, reducedMotion]);

  const underlineStyle = useAnimatedStyle(() => ({
    opacity: underlineOpacity.value,
  }));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          alignItems: 'center',
          marginRight: Space.xs,
        },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityLabel={`Filter by ${label}`}
      accessibilityHint={`Shows ${label} templates`}
      accessibilityRole="button"
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Text
        style={{
          fontFamily: Typography.family.semibold,
          fontSize: Type.body.size,
          color: isActive ? colors.textPrimary : colors.textSecondary,
        }}
      >
        {label}
      </Text>
      <Reanimated.View
        style={[
          {
            height: Stroke.emphasis,
            backgroundColor: colors.brand,
            width: '100%',
            marginTop: Space.xxs,
          },
          underlineStyle,
        ]}
      />
    </Pressable>
  );
}

export interface CreatorTemplateBrowserProps {
  visible: boolean;
  documentType: 'look' | 'poster';
  onClose: () => void;
  onApply: (template: CreatorTemplate) => void;
  hasExistingWork: boolean;
}

/**
 * Instagram-grade template browser:
 * - Search bar at top to filter by name/description
 * - Category filter chips (All, Featured, Interactive, Story, etc.)
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
  const { width: screenWidth } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors, screenWidth), [colors, screenWidth]);
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const templates = useMemo(
    () => getTemplatesByCategory(documentType, activeCategory),
    [documentType, activeCategory],
  );

  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return templates;
    const q = searchQuery.trim().toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q),
    );
  }, [templates, searchQuery]);

  // ── Style-preference-aware sorting ────────────────────────────────
  // Templates whose styleTags overlap with the user's StyleQuiz
  // preferences (stored in personalisationPreferences.categoriesAndSizesPref
  // as a comma-separated string) are sorted to the top so the creator
  // surface reflects the user's taste. Templates without styleTags or
  // with no overlap retain their original order.
  const stylePrefs = useStore(
    (s) => s.personalisationPreferences.categoriesAndSizesPref,
  );
  const preferredStyles = useMemo(
    () =>
      stylePrefs && stylePrefs !== 'Balanced'
        ? stylePrefs.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
    [stylePrefs],
  );

  const sortedTemplates = useMemo(() => {
    if (preferredStyles.length === 0) return filteredTemplates;
    return [...filteredTemplates].sort((a, b) => {
      const aMatch = (a.styleTags ?? []).some((tag) =>
        preferredStyles.includes(tag),
      );
      const bMatch = (b.styleTags ?? []).some((tag) =>
        preferredStyles.includes(tag),
      );
      if (aMatch === bMatch) return 0;
      return aMatch ? -1 : 1;
    });
  }, [filteredTemplates, preferredStyles]);

  const featuredTemplates = useMemo(
    () => sortedTemplates.filter((t) => t.category === 'featured'),
    [sortedTemplates],
  );

  const standardTemplates = useMemo(
    () => sortedTemplates.filter((t) => t.category !== 'featured'),
    [sortedTemplates],
  );

  const handleApply = useCallback(
    (template: CreatorTemplate) => {
      haptic.medium();
      if (hasExistingWork) {
        setConfirmSheet({
          visible: true,
          title: 'Replace current work?',
          message: `Applying "${template.name}" will replace your current canvas. This cannot be undone.`,
          confirmLabel: 'Replace',
          variant: 'danger',
          onConfirm: () => {
            haptic.warning();
            onApply(template);
            onClose();
          },
        });
      } else {
        onApply(template);
        onClose();
      }
    },
    [hasExistingWork, onApply, onClose, haptic],
  );

  const handleCategoryChange = useCallback((cat: TemplateCategory | 'all') => {
    haptic.selection();
    setActiveCategory(cat);
  }, [haptic]);

  const handleClearSearch = useCallback(() => {
    haptic.selection();
    setSearchQuery('');
    searchInputRef.current?.focus();
  }, [haptic]);

  const renderFeaturedItem = useCallback(
    ({ item }: { item: CreatorTemplate }) => {
      const previewDoc = item.build();
      const previewWidth = screenWidth * 0.42;
      const previewHeight = Math.floor(previewWidth / previewDoc.canvas.aspectRatio);

      return (
        <Pressable
          onPress={() => handleApply(item)}
          style={({ pressed }) => [styles.featuredCard, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
          accessibilityLabel={`Apply featured template ${item.name}`}
          accessibilityHint={`Replaces the current canvas with the ${item.name} template`}
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
              <Ionicons name="star" size={IconGrammar.badge} color={colors.textPrimary} />
              <Text style={styles.featuredBadgeText}>Featured</Text>
            </View>
          </View>
          <View style={styles.featuredInfo}>
            <Text style={styles.featuredName} numberOfLines={1}>{item.name}</Text>
          </View>
          <Text style={styles.featuredDesc} numberOfLines={1}>{item.description}</Text>
        </Pressable>
      );
    },
    [handleApply, styles, screenWidth],
  );

  const renderStandardItem = useCallback(
    ({ item }: { item: CreatorTemplate }) => {
      const previewDoc = item.build();
      const previewWidth = 140;
      const previewHeight = Math.floor(previewWidth / previewDoc.canvas.aspectRatio);

      return (
        <Pressable
          onPress={() => handleApply(item)}
          style={({ pressed }) => [styles.templateCard, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
          accessibilityLabel={`Apply template ${item.name}`}
          accessibilityHint={`Replaces the current canvas with the ${item.name} template`}
          accessibilityRole="button"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
          <Text style={styles.templateName} numberOfLines={1}>{item.name}</Text>
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
          accessibilityHint="Closes the template browser"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={IconGrammar.standard} color={colors.textSecondary} />
        </PressScale>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={IconGrammar.metadata} color={colors.textMuted} />
          <TextInput
            ref={searchInputRef}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search templates..."
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={handleClearSearch}
              style={styles.searchClearBtn}
              accessibilityLabel="Clear search"
              accessibilityHint="Clears the search query"
              accessibilityRole="button"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close-circle" size={IconGrammar.metadata} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Category filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryScroll}
      >
        {TEMPLATE_CATEGORIES.map((cat) => (
          <CategoryTab
            key={cat.key}
            label={cat.label}
            isActive={activeCategory === cat.key}
            onPress={() => handleCategoryChange(cat.key)}
            colors={colors}
          />
        ))}
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
            <Text style={styles.emptyText}>
              {searchQuery.trim() ? 'No templates match your search' : 'No templates in this category'}
            </Text>
          </View>
        }
      />
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
      />
    </SheetContainer>
  );
}

function createStyles(colors: ThemeColors, screenWidth: number) {
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
    width: Control.hit,
    height: Control.hit,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  // ── Search bar ──
  searchContainer: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    gap: Space.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    color: colors.textPrimary,
    padding: 0,
  },
  searchClearBtn: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ── Category tabs ──
  categoryScroll: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
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
    width: screenWidth * 0.42,
  },
  featuredPreviewWrap: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Space.xs,
    position: 'relative',
  },
  featuredBadge: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs,
    backgroundColor: withAlpha(colors.antiqueGold, 0.95),
    paddingHorizontal: Space.xs,
    paddingVertical: Space.xxs,
    borderRadius: Radius.full,
  },
  featuredBadgeText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.meta.size,
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  featuredInfo: {
    marginBottom: Space.xxs,
  },
  featuredName: {
    flex: 1,
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyStrong.size,
    color: colors.textPrimary,
  },
  featuredDesc: {
    fontFamily: Typography.family.regular,
    fontSize: Type.meta.size,
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
    padding: Space.xs,
  },
  previewContainer: {
    alignItems: 'center',
    marginBottom: Space.xs,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  templateName: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
    color: colors.textPrimary,
    marginBottom: Space.xxs,
    paddingHorizontal: Space.xs,
  },
  templateDesc: {
    fontFamily: Typography.family.regular,
    fontSize: Type.meta.size,
    color: colors.textMuted,
    lineHeight: 14,
    paddingHorizontal: Space.xs,
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
    textAlign: 'center',
  },
  });
}
