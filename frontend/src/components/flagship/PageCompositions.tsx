/**
 * Department-specific page composition primitives.
 *
 * The generic `FlagshipScreen` is a neutral scroll container — every
 * department gets the same header / scroll / sticky-footer silhouette, which
 * is why surfaces feel templated (audit P2-11). These shells compose
 * `FlagshipScreen` but impose a department grammar on top:
 *
 *  - MediaStageScreen      — PDP, discovery detail. Media is the dominant
 *                            object; content is a sheet that slides over it.
 *  - DenseListScreen       — inbox, inventory, analytics. Compact rows,
 *                            optional segmentation, no oversized cards.
 *  - SettingsCanvasScreen  — settings, account. Searchable IA, current-value
 *                            display, no dashboard metrics or decorative cards.
 *  - TaskQueueScreen       — Seller Hub. One urgent task hero, compressed
 *                            secondary facts, no equal KPI tile.
 *  - CommitmentScreen      — checkout. Order truth + total dominate; delivery
 *                            / payment / protection support; no brand decoration.
 *
 * Design rules (AGENTS.md §4 + Design.md §9.4):
 *  - One dominant object per screen.
 *  - No card-on-card composition; flat canvas + hairlines by default.
 *  - No decorative chrome (shadows, gradients, pills on every element).
 *  - No label-everything disease, no duplicate headings.
 *  - Full state coverage is the consumer's responsibility (loading / empty /
 *    error / offline) — these shells stay neutral so state surfaces read
 *    clearly against them.
 *
 * Each shell accepts a `density` prop so a department can tighten or loosen
 * its rhythm without forking the shell. Defaults follow Design.md §9.4.
 */
import React from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  ScrollView,
  Text,
  TextInput,
  Pressable,
} from 'react-native';
import type { RefreshControlProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlagshipScreen, FlagshipScreenProps } from './FlagshipScreen';
import { useAppTheme } from '../../theme/ThemeContext';
import {
  Space,
  Radius,
  Stroke,
  Type,
  FontFamily,
  Control,
} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import {
  Density,
  DensityConfig,
  useDensity,
} from '../../theme/density';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface BaseShellProps {
  /** Screen-level testID for Maestro visual-regression selectors. */
  testID?: string;
  /** Override the density posture. Each shell picks a sensible default. */
  density?: Density;
  style?: ViewStyle;
}

/** Resolve a density config, falling back to the shell's default. */
function resolveDensity(density: Density | undefined, fallback: Density): DensityConfig {
  return useDensity(density ?? fallback);
}

// ---------------------------------------------------------------------------
// 1. MediaStageScreen — PDP, discovery detail
// ---------------------------------------------------------------------------

export interface MediaStageScreenProps extends BaseShellProps {
  /** Full-bleed media zone rendered above the content sheet, edge-to-edge.
   *  No gutter — media is the dominant object. */
  mediaZone: React.ReactNode;
  /** Content sheet that slides up over the media. Item truth, seller,
   *  shipping, policy live here. */
  children: React.ReactNode;
  /** Sticky action bar at the bottom — primary action + trust anchor. */
  actionBar?: React.ReactNode;
  /** Optional header chrome over the media (transparent back / close). */
  header?: React.ReactNode;
  /** Media height. Defaults to a 3:4 portrait stage. */
  mediaHeight?: number;
}

/**
 * Media-first composition for product detail and discovery detail.
 *
 * The media zone is full-bleed and unguttered — it is the dominant object and
 * the primary colour of the screen. The content sheet slides up over it with
 * a top radius, carrying item truth (title, price, trust, specifics, seller,
 * shipping, policy). The sticky action bar anchors the primary commitment.
 *
 * Anti-AI: no promo modules hidden above item truth, no decorative gradient
 * headers, no card-on-card. The sheet is a single surface with hairline
 * section separators.
 */
export function MediaStageScreen({
  mediaZone,
  children,
  actionBar,
  header,
  mediaHeight,
  density,
  testID,
  style,
}: MediaStageScreenProps) {
  const { colors } = useAppTheme();
  const cfg = resolveDensity(density, 'editorial');
  const insets = useSafeAreaInsets();
  const stageHeight = mediaHeight ?? Math.round(360 * (4 / 3));

  return (
    <FlagshipScreen
      testID={testID}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      style={StyleSheet.flatten([{ backgroundColor: colors.background }, style]) as ViewStyle}
    >
      {/* Media stage — full bleed, no gutter. Header floats over it. */}
      <View style={[styles.mediaStage, { height: stageHeight }]}>
        {mediaZone}
        {header ? (
          <View style={[styles.mediaHeader, { paddingTop: insets.top }]} pointerEvents="box-none">
            {header}
          </View>
        ) : null}
      </View>

      {/* Content sheet — slides over the media, single surface, hairline sections. */}
      <View style={[styles.sheet, { backgroundColor: colors.background, borderTopLeftRadius: cfg.cardRadius + 4, borderTopRightRadius: cfg.cardRadius + 4 }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: cfg.gutter, paddingTop: cfg.sectionGap }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
          <View style={{ height: actionBar ? Space.xxl : Space.xl }} />
        </ScrollView>
      </View>

      {/* Sticky action bar — primary commitment + trust anchor. */}
      {actionBar ? (
        <View
          style={[
            styles.actionBar,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, Space.md),
            },
          ]}
        >
          {actionBar}
        </View>
      ) : null}
    </FlagshipScreen>
  );
}

// ---------------------------------------------------------------------------
// 2. DenseListScreen — inbox, inventory, analytics rows
// ---------------------------------------------------------------------------

export interface DenseListScreenProps extends BaseShellProps {
  /** Compact header (title + optional right action). */
  header?: React.ReactNode;
  /** Optional segmented control (e.g. Primary / Requests for inbox). */
  segments?: React.ReactNode;
  /** Optional filter rail rendered as a horizontal strip under the segments. */
  filterRail?: React.ReactNode;
  /** Dense scrollable list. Consumer renders rows at compact density.
   *  Ignored when `list` is provided. */
  children?: React.ReactNode;
  /** Recycler / FlashList body that owns its own scroll surface. When
   *  provided, it replaces the internal ScrollView so long lists keep
   *  row recycling. The consumer is responsible for bottom inset so the
   *  last row clears the sticky footer. */
  list?: React.ReactNode;
  /** Optional node rendered above the list chrome (e.g. a search field or
   *  summary ledger that lives outside the scroll surface). */
  preList?: React.ReactNode;
  /** Optional banner rendered at the very top of the body (e.g. OfflineBanner). */
  banner?: React.ReactNode;
  /** Optional sticky footer (e.g. archive action). */
  stickyFooter?: React.ReactNode;
}

/**
 * Compact list composition for inbox, inventory and analytics row surfaces.
 *
 * The dominant object is people / items / rows — not cards. Rows are compact
 * (56pt), separated by hairlines, not gaps and shadows. Optional segmentation
 * (Primary / Requests) and a filter rail sit above the list as flat strips.
 *
 * Consumers with long lists pass `list` (a FlashList/recycler) to preserve row
 * recycling; the archetype still owns the header, list chrome and sticky
 * footer so the department silhouette stays consistent.
 *
 * Anti-AI: no oversized cards, no excessive empty margins, no card-on-card.
 * The list is a flat canvas; spacing and hairlines do the structural work.
 */
export function DenseListScreen({
  header,
  segments,
  filterRail,
  children,
  list,
  preList,
  banner,
  stickyFooter,
  density,
  testID,
  style,
}: DenseListScreenProps) {
  const { colors } = useAppTheme();
  const cfg = resolveDensity(density, 'compact');

  return (
    <FlagshipScreen
      testID={testID}
      header={header}
      stickyFooter={stickyFooter}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      style={StyleSheet.flatten([{ backgroundColor: colors.background }, style]) as ViewStyle}
    >
      {banner}
      {preList}
      {(segments || filterRail) ? (
        <View style={[styles.listChrome, { borderBottomColor: colors.border }]}>
          {segments ? (
            <View style={{ paddingHorizontal: cfg.gutter, paddingVertical: Space.sm }}>
              {segments}
            </View>
          ) : null}
          {filterRail ? (
            <View style={{ paddingBottom: Space.sm }}>{filterRail}</View>
          ) : null}
        </View>
      ) : null}

      {list ? (
        list
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: cfg.gutter, paddingTop: Space.sm }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
          <View style={{ height: stickyFooter ? Space.xxl : Space.xl }} />
        </ScrollView>
      )}
    </FlagshipScreen>
  );
}

// ---------------------------------------------------------------------------
// 3. SettingsCanvasScreen — settings, account
// ---------------------------------------------------------------------------

export interface SettingsCanvasScreenProps extends BaseShellProps {
  /** Searchable header (title + optional back). */
  header?: React.ReactNode;
  /** Optional banner rendered above the search field (e.g. OfflineBanner). */
  banner?: React.ReactNode;
  /** Placeholder for the search field. When omitted, no search field renders. */
  searchPlaceholder?: string;
  /** Search query callback. Required when `searchPlaceholder` is set. */
  onSearch?: (query: string) => void;
  /** Custom search field node. When provided, replaces the built-in search
   *  field so a consumer can use the app's design-system search component
   *  while keeping the canvas grammar (search pinned under the header with a
   *  hairline separator). `searchPlaceholder` / `onSearch` are ignored. */
  searchField?: React.ReactNode;
  /** Sectioned list with current-value display. Consumer renders sections. */
  children: React.ReactNode;
  /** Override the scroll content container style. Pass
   *  `{ paddingHorizontal: 0 }` when children self-pad (e.g. SettingsSection). */
  contentContainerStyle?: ViewStyle;
}

/**
 * Searchable settings canvas.
 *
 * The dominant object is the information architecture — sections and their
 * current values — not dashboard metrics or decorative cards. A search field
 * sits directly under the header so the user can find any setting by typing.
 * Sections are flat grouped lists with hairline separators; each row shows the
 * setting name and its current value / consequence.
 *
 * Anti-AI: no dashboard metric tiles, no decorative cards, no label-everything
 * disease. The canvas is flat; typography and hairlines carry hierarchy.
 */
export function SettingsCanvasScreen({
  header,
  banner,
  searchPlaceholder,
  onSearch,
  searchField,
  children,
  contentContainerStyle,
  density,
  testID,
  style,
}: SettingsCanvasScreenProps) {
  const { colors } = useAppTheme();
  const cfg = resolveDensity(density, 'regular');
  const [query, setQuery] = React.useState('');

  const handleSearch = (text: string) => {
    setQuery(text);
    onSearch?.(text);
  };

  const hasSearch = Boolean(searchField || searchPlaceholder);

  return (
    <FlagshipScreen
      testID={testID}
      header={header}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      style={StyleSheet.flatten([{ backgroundColor: colors.background }, style]) as ViewStyle}
    >
      {banner}
      {hasSearch ? (
        <View style={[styles.searchWrap, { borderBottomColor: colors.border }]}>
          {searchField ? (
            <View style={{ marginHorizontal: cfg.gutter }}>
              {searchField}
            </View>
          ) : (
            <View
              style={[
                styles.searchField,
                {
                  backgroundColor: colors.surfaceAlt,
                  borderColor: colors.borderSubtle,
                  marginHorizontal: cfg.gutter,
                },
              ]}
            >
              <Text style={[styles.searchIcon, { color: colors.textMuted }]}>⌕</Text>
              <TextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder={searchPlaceholder}
                placeholderTextColor={colors.textMuted}
                value={query}
                onChangeText={handleSearch}
                accessibilityRole="search"
                returnKeyType="search"
                autoCorrect={false}
              />
            </View>
          )}
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: cfg.gutter, paddingTop: cfg.sectionGap / 2 }, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
        <View style={{ height: Space.xl }} />
      </ScrollView>
    </FlagshipScreen>
  );
}

// ---------------------------------------------------------------------------
// 4. TaskQueueScreen — Seller Hub
// ---------------------------------------------------------------------------

export interface TaskQueueScreenProps extends BaseShellProps {
  /** One urgent task hero at the top — the dominant object. */
  urgentTask: React.ReactNode;
  /** Compressed secondary facts: pulse, inventory, tools. */
  children: React.ReactNode;
  /** Optional header. */
  header?: React.ReactNode;
  /** Optional banner rendered above the scroll surface (e.g. OfflineBanner). */
  banner?: React.ReactNode;
  /** Optional refresh control for the scroll surface. */
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Override the scroll content container style. Pass
   *  `{ paddingHorizontal: 0 }` when children self-pad (e.g. FlagshipFormSection). */
  contentContainerStyle?: ViewStyle;
}

/**
 * Task-queue composition for Seller Hub.
 *
 * The dominant object is a single urgent task — not an equal KPI tile grid.
 * The hero occupies the top of the viewport so the seller's next action is
 * obvious without scrolling. Secondary facts (pulse, inventory, tools) are
 * compressed below as flat rows, not a grid of competing tiles.
 *
 * Anti-AI: no equal KPI tile grid, no dashboard silhouette. One task leads,
 * everything else supports.
 */
export function TaskQueueScreen({
  urgentTask,
  children,
  header,
  banner,
  refreshControl,
  contentContainerStyle,
  density,
  testID,
  style,
}: TaskQueueScreenProps) {
  const { colors } = useAppTheme();
  const cfg = resolveDensity(density, 'regular');

  return (
    <FlagshipScreen
      testID={testID}
      header={header}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      style={StyleSheet.flatten([{ backgroundColor: colors.background }, style]) as ViewStyle}
    >
      {banner}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[{ paddingHorizontal: cfg.gutter }, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        {/* Urgent task hero — dominant object, top of viewport. */}
        <View style={{ paddingTop: cfg.sectionGap / 2, paddingBottom: cfg.sectionGap }}>
          {urgentTask}
        </View>

        {/* Secondary facts — flat rows, no tile grid. */}
        <View style={[styles.secondaryFacts, { borderTopColor: colors.border }]}>
          {children}
        </View>
        <View style={{ height: Space.xxl }} />
      </ScrollView>
    </FlagshipScreen>
  );
}

// ---------------------------------------------------------------------------
// 5. CommitmentScreen — checkout
// ---------------------------------------------------------------------------

export interface CommitmentScreenProps extends BaseShellProps {
  /** Header (back + minimal title). */
  header?: React.ReactNode;
  /** Order truth + total — the dominant object. Rendered as a pinned summary
   *  at the top of the scroll area so it stays visible while the user reviews
   *  supporting layers. */
  orderSummary: React.ReactNode;
  /** Supporting layers: delivery, payment, protection. */
  children: React.ReactNode;
  /** Commit bar — the single primary action (Place order). */
  commitBar: React.ReactNode;
}

/**
 * Commitment composition for checkout.
 *
 * The dominant object is the order truth and total. It sits at the top of the
 * scroll surface and stays visible; delivery, payment and protection are
 * supporting layers below it. The commit bar is the single primary action —
 * no competing brand decoration.
 *
 * Anti-AI: no brand decoration competing with commitment, no promo modules,
 * no card-on-card. The summary is one surface; supporting layers are flat
 * grouped rows with hairline separators.
 */
export function CommitmentScreen({
  header,
  orderSummary,
  children,
  commitBar,
  density,
  testID,
  style,
}: CommitmentScreenProps) {
  const { colors } = useAppTheme();
  const cfg = resolveDensity(density, 'regular');
  const insets = useSafeAreaInsets();

  return (
    <FlagshipScreen
      testID={testID}
      header={header}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      style={StyleSheet.flatten([{ backgroundColor: colors.background }, style]) as ViewStyle}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: cfg.gutter, paddingTop: cfg.sectionGap / 2 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Order truth + total — dominant object, pinned to top of content. */}
        <View style={{ paddingBottom: cfg.sectionGap }}>
          {orderSummary}
        </View>

        {/* Supporting layers — delivery, payment, protection. */}
        <View style={[styles.supportingLayers, { borderTopColor: colors.border }]}>
          {children}
        </View>
        <View style={{ height: Space.xxl }} />
      </ScrollView>

      {/* Commit bar — single primary action. */}
      <View
        style={[
          styles.commitBar,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, Space.md),
          },
        ]}
      >
        {commitBar}
      </View>
    </FlagshipScreen>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // MediaStageScreen
  mediaStage: {
    width: '100%',
    overflow: 'hidden',
  },
  mediaHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  sheet: {
    flex: 1,
    marginTop: -Radius.xl,
    paddingTop: 0,
  },
  actionBar: {
    borderTopWidth: Stroke.hairline,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },

  // DenseListScreen
  listChrome: {
    borderBottomWidth: Stroke.hairline,
  },

  // SettingsCanvasScreen
  searchWrap: {
    paddingBottom: Space.sm,
    borderBottomWidth: Stroke.hairline,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    paddingHorizontal: Space.sm,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: Space.xs,
    fontFamily: FontFamily.regular,
  },
  searchInput: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    padding: 0,
  },

  // TaskQueueScreen
  secondaryFacts: {
    borderTopWidth: Stroke.hairline,
    paddingTop: Space.sm,
  },

  // CommitmentScreen
  supportingLayers: {
    borderTopWidth: Stroke.hairline,
    paddingTop: Space.sm,
  },
  commitBar: {
    borderTopWidth: Stroke.hairline,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
});

// Re-export density types for consumers importing from the flagship barrel.
export type { Density, DensityConfig } from '../../theme/density';
