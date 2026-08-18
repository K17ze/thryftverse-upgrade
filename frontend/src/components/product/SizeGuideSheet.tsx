import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Space, Radius, Type } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';

// ── Size guide data ──────────────────────────────────────────────────────────
// Standard retail measurement tables per category. These are reference charts,
// not fabricated product data. Used as a buyer reference tool.

interface SizeGuideRow {
  size: string;
  measurements: Record<string, string>;
}

interface SizeGuideCategory {
  title: string;
  columns: string[];
  rows: SizeGuideRow[];
}

const SIZE_GUIDES: Record<string, SizeGuideCategory> = {
  tops: {
    title: 'Tops — Chest & Length',
    columns: ['Size', 'Chest (cm)', 'Length (cm)'],
    rows: [
      { size: 'XS', measurements: { chest: '81–86', length: '66' } },
      { size: 'S', measurements: { chest: '86–91', length: '68' } },
      { size: 'M', measurements: { chest: '91–96', length: '70' } },
      { size: 'L', measurements: { chest: '96–101', length: '72' } },
      { size: 'XL', measurements: { chest: '101–106', length: '74' } },
      { size: 'XXL', measurements: { chest: '106–111', length: '76' } },
    ],
  },
  bottoms: {
    title: 'Bottoms — Waist & Inseam',
    columns: ['Size', 'Waist (cm)', 'Inseam (cm)'],
    rows: [
      { size: 'XS', measurements: { waist: '64–69', inseam: '76' } },
      { size: 'S', measurements: { waist: '69–74', inseam: '78' } },
      { size: 'M', measurements: { waist: '74–79', inseam: '80' } },
      { size: 'L', measurements: { waist: '79–84', inseam: '82' } },
      { size: 'XL', measurements: { waist: '84–89', inseam: '84' } },
      { size: 'XXL', measurements: { waist: '89–94', inseam: '86' } },
    ],
  },
  dresses: {
    title: 'Dresses — Bust & Waist',
    columns: ['Size', 'Bust (cm)', 'Waist (cm)'],
    rows: [
      { size: 'XS', measurements: { bust: '78–82', waist: '60–64' } },
      { size: 'S', measurements: { bust: '82–86', waist: '64–68' } },
      { size: 'M', measurements: { bust: '86–90', waist: '68–72' } },
      { size: 'L', measurements: { bust: '90–94', waist: '72–76' } },
      { size: 'XL', measurements: { bust: '94–98', waist: '76–80' } },
      { size: 'XXL', measurements: { bust: '98–102', waist: '80–84' } },
    ],
  },
  shoes: {
    title: 'Shoes — UK / EU / US',
    columns: ['UK', 'EU', 'US (M)', 'US (F)', 'Foot (cm)'],
    rows: [
      { size: '4', measurements: { eu: '37', usm: '5', usf: '6.5', foot: '23.5' } },
      { size: '5', measurements: { eu: '38', usm: '6', usf: '7.5', foot: '24.1' } },
      { size: '6', measurements: { eu: '39', usm: '7', usf: '8.5', foot: '24.7' } },
      { size: '7', measurements: { eu: '40', usm: '8', usf: '9.5', foot: '25.4' } },
      { size: '8', measurements: { eu: '41', usm: '9', usf: '10.5', foot: '26.0' } },
      { size: '9', measurements: { eu: '42', usm: '10', usf: '11.5', foot: '26.7' } },
      { size: '10', measurements: { eu: '43', usm: '11', usf: '12.5', foot: '27.3' } },
      { size: '11', measurements: { eu: '44', usm: '12', usf: '13.5', foot: '27.9' } },
    ],
  },
  outerwear: {
    title: 'Outerwear — Chest & Shoulder',
    columns: ['Size', 'Chest (cm)', 'Shoulder (cm)'],
    rows: [
      { size: 'XS', measurements: { chest: '84–89', shoulder: '42' } },
      { size: 'S', measurements: { chest: '89–94', shoulder: '44' } },
      { size: 'M', measurements: { chest: '94–99', shoulder: '46' } },
      { size: 'L', measurements: { chest: '99–104', shoulder: '48' } },
      { size: 'XL', measurements: { chest: '104–109', shoulder: '50' } },
      { size: 'XXL', measurements: { chest: '109–114', shoulder: '52' } },
    ],
  },
  accessories: {
    title: 'Accessories — One Size',
    columns: ['Size', 'Notes'],
    rows: [
      { size: 'One Size', measurements: { notes: 'Hats, belts, scarves — check item description for specifics' } },
    ],
  },
  bags: {
    title: 'Bags — Dimensions',
    columns: ['Size', 'Width (cm)', 'Height (cm)', 'Depth (cm)'],
    rows: [
      { size: 'Mini', measurements: { width: '<20', height: '<15', depth: '<8' } },
      { size: 'Small', measurements: { width: '20–25', height: '15–20', depth: '8–12' } },
      { size: 'Medium', measurements: { width: '25–30', height: '20–25', depth: '12–16' } },
      { size: 'Large', measurements: { width: '30–35', height: '25–30', depth: '16–20' } },
      { size: 'XL', measurements: { width: '>35', height: '>30', depth: '>20' } },
    ],
  },
  jewellery: {
    title: 'Jewellery — Ring & Necklace',
    columns: ['Type', 'Size Guide'],
    rows: [
      { size: 'Ring', measurements: { guide: 'UK letters A–Z; EU 37–70; US 0.5–13' } },
      { size: 'Necklace', measurements: { guide: 'Choker 35–40cm · Princess 45–50cm · Matinee 55–60cm · Opera 70–85cm' } },
      { size: 'Bracelet', measurements: { guide: 'Small 15cm · Medium 17cm · Large 19cm · XL 21cm' } },
    ],
  },
};

function resolveSizeGuide(category: string | null | undefined): SizeGuideCategory | null {
  if (!category) return null;
  const normalized = category.toLowerCase().trim();
  return SIZE_GUIDES[normalized] ?? null;
}

// ── Component ────────────────────────────────────────────────────────────────

export interface SizeGuideSheetProps {
  visible: boolean;
  category?: string | null;
  currentSize?: string | null;
  onClose: () => void;
}

export function SizeGuideSheet({
  visible,
  category,
  currentSize,
  onClose,
}: SizeGuideSheetProps) {
  const { colors } = useAppTheme();
  const guide = useMemo(() => resolveSizeGuide(category), [category]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.background }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                Size guide
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close size guide"
            >
              <Text style={[styles.closeText, { color: colors.brand }]}>Done</Text>
            </Pressable>
          </View>

          {guide ? (
            <>
              <Text style={[styles.guideTitle, { color: colors.textSecondary }]}>
                {guide.title}
              </Text>
              <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                {/* Measurement table — flat with hairline separators.
                    Per AGENTS.md: flat canvas, hairlines are the default
                    utility structure. No bordered card container. */}
                <View style={styles.table}>
                  <View
                    style={[
                      styles.tableHeader,
                      { backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle },
                    ]}
                  >
                    {guide.columns.map((col, colIdx) => (
                      <Text
                        key={col}
                        style={[
                          styles.tableHeaderText,
                          { color: colors.textMuted },
                          colIdx === 0 && styles.tableHeaderFirstCol,
                        ]}
                        numberOfLines={1}
                      >
                        {col}
                      </Text>
                    ))}
                  </View>
                  {guide.rows.map((row, rowIdx) => {
                    const isCurrentRow = currentSize != null &&
                      row.size.toLowerCase() === currentSize.toLowerCase();
                    const isLastRow = rowIdx === guide.rows.length - 1;
                    return (
                      <View
                        key={row.size}
                        style={[
                          styles.tableRow,
                          { borderBottomColor: colors.borderSubtle },
                          rowIdx % 2 === 1 && !isCurrentRow && { backgroundColor: colors.surface },
                          isCurrentRow && { backgroundColor: `${colors.brand}12` },
                          isLastRow && { borderBottomWidth: 0 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tableCell,
                            { color: colors.textPrimary },
                            styles.tableFirstCol,
                            isCurrentRow && { color: colors.brand, fontFamily: Typography.family.semibold },
                          ]}
                          numberOfLines={1}
                        >
                          {isCurrentRow ? `${row.size} · You` : row.size}
                        </Text>
                        {guide.columns.slice(1).map((col) => {
                          const key = col.toLowerCase().split(' ')[0];
                          const value = row.measurements[key] ?? row.measurements[col.toLowerCase()] ?? '—';
                          return (
                            <Text
                              key={col}
                              style={[
                                styles.tableCell,
                                { color: colors.textPrimary },
                                isCurrentRow && { color: colors.brand, fontFamily: Typography.family.semibold },
                              ]}
                              numberOfLines={1}
                            >
                              {value}
                            </Text>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>

                {/* How to measure tip */}
                <View style={[styles.measureTipRow, { borderTopColor: colors.borderSubtle }]}>
                  <Ionicons name="resize-outline" size={16} color={colors.brand} />
                  <Text style={[styles.measureTipText, { color: colors.textSecondary }]}>
                    Lay the garment flat and measure armpit-to-armpit for chest, shoulder seam to hem for length.
                  </Text>
                </View>

                {/* Footer note */}
                <View style={styles.footerNote}>
                  <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
                  <Text style={[styles.footerText, { color: colors.textMuted }]}>
                    Standard retail references. Always check the item description for specific measurements.
                  </Text>
                </View>
              </ScrollView>
            </>
          ) : (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.surface }]}>
                <Ionicons name="resize-outline" size={32} color={colors.textMuted} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                No size guide available
              </Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Size guides are available for tops, bottoms, dresses, shoes, outerwear, bags, and jewellery.
              </Text>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export { resolveSizeGuide };

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Space.xl,
    maxHeight: '75%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginTop: Space.sm,
    marginBottom: Space.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    minHeight: 44,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  title: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  closeText: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  guideTitle: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.medium,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  scroll: {
    paddingHorizontal: Space.md,
  },
  // ── Table — flat with hairline separators ──
  table: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableHeaderText: {
    flex: 1,
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.meta.letterSpacing,
    textTransform: 'uppercase',
  },
  tableHeaderFirstCol: {
    flex: 0.7,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  tableCell: {
    flex: 1,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
  },
  tableFirstCol: {
    flex: 0.7,
    fontFamily: Typography.family.semibold,
  },
  // ── Tips and notes ──
  measureTipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2,
    paddingHorizontal: Space.sm,
    paddingTop: Space.md,
    marginTop: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  measureTipText: {
    flex: 1,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight + 2,
    fontFamily: Typography.family.medium,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2,
    paddingTop: Space.md,
    paddingBottom: Space.lg,
  },
  footerText: {
    flex: 1,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight + 2,
    fontFamily: Typography.family.regular,
  },
  // ── Empty state ──
  emptyState: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xl,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  emptyTitle: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
    marginBottom: Space.xs,
  },
  emptyText: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight + 2,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
  },
});
