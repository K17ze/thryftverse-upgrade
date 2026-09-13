import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import type { Listing } from '../../services/listingsApi';
import { CategoryEvidence } from '../commerce';
import { CommerceDetailSection } from '../commerce/detail';
import { resolveEvidenceGroups } from '../../platform/commerce/categoryEvidence';
import { Space, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { ItemDetailConditionMeta } from '../../hooks/itemDetail/itemDetailDerived';

export interface ItemDetailItemDetailsProps {
  /** The resolved listing. */
  item: Listing;
  /** Condition accent + plain-English definition (null when unmapped). */
  conditionMeta: ItemDetailConditionMeta | null;
  /** Progressive-disclosure state for the description block. */
  descriptionExpanded: boolean;
  setDescriptionExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  /** Opens the fullscreen media viewer at the given image index. */
  onOpenViewer: (index: number) => void;
}

/**
 * Zone D — "Item details" section: condition evidence (grade +
 * definition + photo jump), the collapsible description with the
 * gradient fade, the category-evidence attribute groups, and the
 * posted date. Progressive disclosure — sits after trust facts,
 * before shipping.
 */
export function ItemDetailItemDetails({
  item,
  conditionMeta,
  descriptionExpanded,
  setDescriptionExpanded,
  onOpenViewer,
}: ItemDetailItemDetailsProps) {
  const { colors } = useAppTheme();

  return (
    <CommerceDetailSection label="Item details" divider variant="editorial">
      {/* ── Condition evidence ──
          Condition is the primary judgment fact on a second-hand
          listing. Render the grade plus what the grade means inline —
          the buyer should not have to open a sheet to learn what
          "Good" means. When the listing carries more than one photo,
          the trailing photos are the flaw/detail evidence; the jump
          opens the fullscreen viewer on the last shot. */}
      {item.condition ? (
        <View
          style={styles.conditionEvidence}
          accessibilityLabel={`Condition: ${item.condition}${conditionMeta ? `. ${conditionMeta.definition}` : ''}`}
        >
          <View style={styles.conditionEvidenceHeader}>
            <View style={[styles.conditionDot, { backgroundColor: conditionMeta?.color ?? colors.textMuted }]} />
            <Text style={[styles.conditionEvidenceName, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>
              {item.condition}
            </Text>
          </View>
          {conditionMeta ? (
            <Text style={[styles.conditionEvidenceDefinition, { color: colors.textSecondary }]} maxFontSizeMultiplier={2}>
              {conditionMeta.definition}
            </Text>
          ) : null}
          {item.images && item.images.length > 1 ? (
            <AnimatedPressable
              style={styles.conditionEvidenceJump}
              scaleValue={0.98}
              hapticFeedback="light"
              onPress={() => {
                // Jump to the last photo (detail/flaw shot per policy)
                onOpenViewer(item.images!.length - 1);
              }}
              accessibilityLabel="View condition evidence photos"
              accessibilityRole="button"
            >
              <Ionicons name="images-outline" size={18} color={colors.brand} />
              <Text style={[styles.conditionEvidenceJumpText, { color: colors.brand }]} maxFontSizeMultiplier={2}>
                View condition photos
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.brand} />
            </AnimatedPressable>
          ) : null}
        </View>
      ) : null}
      {item.description ? (
        <View style={styles.descriptionWrap}>
          {/* Full-area tap target — the entire collapsed text is
              tappable, not just the "Read more" link. Buyers often
              do not notice that a description can be expanded via
              a small "see more" link, so the whole collapsed block
              is the hit target. */}
          <Pressable
            onPress={() => {
              if (item.description && item.description.length > 120) {
                setDescriptionExpanded((prev) => !prev);
              }
            }}
            accessibilityLabel={descriptionExpanded ? 'Show less' : 'Read more'}
            accessibilityRole="button"
            accessibilityState={{ expanded: descriptionExpanded }}
            disabled={descriptionExpanded || (item.description.length <= 120)}
          >
            <Text
              style={[styles.descriptionText, { color: colors.textPrimary }]}
              numberOfLines={descriptionExpanded ? undefined : 3}
              maxFontSizeMultiplier={2}
            >
              {item.description}
            </Text>
            {/* Gradient fade at the collapse edge when collapsed.
                Visual signal that there's more content below. */}
            {!descriptionExpanded && item.description.length > 120 && (
              <LinearGradient
                // NOTE: hex-alpha required for gradient stops — token substitution not applicable
                colors={[`${colors.background}00`, colors.background]}
                style={styles.descriptionFade}
                pointerEvents="none"
                accessible={false}
              />
            )}
          </Pressable>
          {item.description.length > 120 && (
            <AnimatedPressable
              onPress={() => setDescriptionExpanded((prev) => !prev)}
              hitSlop={8}
              style={styles.quietTextTarget}
              scaleValue={0.98}
              hapticFeedback="light"
              accessibilityLabel={descriptionExpanded ? 'Show less' : 'Read more'}
              accessibilityRole="button"
              accessibilityState={{ expanded: descriptionExpanded }}
            >
              <Text style={[styles.descriptionToggle, { color: colors.textSecondary }]} maxFontSizeMultiplier={2}>
                {descriptionExpanded ? 'Show less' : 'Read more'}
              </Text>
            </AnimatedPressable>
          )}
        </View>
      ) : null}

      {(() => {
        // ── Category evidence ──
        // resolveEvidenceGroups() supports car/yacht fields (make,
        // mileage, transmission, fuelType, bodyType, serviceRecords,
        // motInspection, mechanicalCondition, inspectionAvailable,
        // inspectionReport, v5Logbook, numberOfOwners, financeStatus,
        // length, beam, draft, displacement, engineType, engineHours,
        // surveyAvailable, surveyDate, surveyReport, registration,
        // flag, ownershipDocs, viewingAvailable, viewingLocation,
        // seaTrialAvailable) plus watch/art/electronics extras
        // (material, measurements, flaws, reference, movement,
        // caseSize, serviceHistory, boxPapers, dimensions, hardware,
        // exteriorCondition, interiorCondition, includedAccessories,
        // serialImagery, provenance, model, storage, batteryCondition,
        // functionalIssues, warranty, creator, year, medium, edition).
        //
        // The Listing model does not yet declare these fields, so we
        // read them dynamically from the listing object. When the
        // backend schema is extended to return them, they will flow
        // through here without further frontend changes. Until then
        // only the known fields (category, subcategory, brand, size,
        // condition, description) are guaranteed to be present, which
        // keeps the existing evidence groups rendering correctly.
        const dynamicItem = item as unknown as Record<string, string | null | undefined>;
        const pickStr = (key: string): string | null | undefined => {
          const value = dynamicItem[key];
          return typeof value === 'string' ? value : null;
        };
        const evidenceGroups = resolveEvidenceGroups({
          // Known Listing fields
          category: item.category,
          subcategory: item.subcategory,
          brand: item.brand,
          size: item.size,
          condition: item.condition,
          description: item.description,
          // Watch / jewellery / electronics / art extras
          material: pickStr('material'),
          measurements: pickStr('measurements'),
          flaws: pickStr('flaws'),
          reference: pickStr('reference'),
          movement: pickStr('movement'),
          caseSize: pickStr('caseSize'),
          serviceHistory: pickStr('serviceHistory'),
          boxPapers: pickStr('boxPapers'),
          dimensions: pickStr('dimensions'),
          hardware: pickStr('hardware'),
          exteriorCondition: pickStr('exteriorCondition'),
          interiorCondition: pickStr('interiorCondition'),
          includedAccessories: pickStr('includedAccessories'),
          serialImagery: pickStr('serialImagery'),
          provenance: pickStr('provenance'),
          model: pickStr('model'),
          storage: pickStr('storage'),
          batteryCondition: pickStr('batteryCondition'),
          functionalIssues: pickStr('functionalIssues'),
          warranty: pickStr('warranty'),
          creator: pickStr('creator'),
          year: pickStr('year'),
          medium: pickStr('medium'),
          edition: pickStr('edition'),
          // Car fields
          make: pickStr('make'),
          mileage: pickStr('mileage'),
          transmission: pickStr('transmission'),
          fuelType: pickStr('fuelType'),
          bodyType: pickStr('bodyType'),
          serviceRecords: pickStr('serviceRecords'),
          motInspection: pickStr('motInspection'),
          mechanicalCondition: pickStr('mechanicalCondition'),
          inspectionAvailable: pickStr('inspectionAvailable'),
          inspectionReport: pickStr('inspectionReport'),
          v5Logbook: pickStr('v5Logbook'),
          numberOfOwners: pickStr('numberOfOwners'),
          financeStatus: pickStr('financeStatus'),
          // Yacht fields
          length: pickStr('length'),
          beam: pickStr('beam'),
          draft: pickStr('draft'),
          displacement: pickStr('displacement'),
          engineType: pickStr('engineType'),
          engineHours: pickStr('engineHours'),
          surveyAvailable: pickStr('surveyAvailable'),
          surveyDate: pickStr('surveyDate'),
          surveyReport: pickStr('surveyReport'),
          registration: pickStr('registration'),
          flag: pickStr('flag'),
          ownershipDocs: pickStr('ownershipDocs'),
          viewingAvailable: pickStr('viewingAvailable'),
          viewingLocation: pickStr('viewingLocation'),
          seaTrialAvailable: pickStr('seaTrialAvailable'),
        });
        return evidenceGroups.length > 0 ? (
          <CategoryEvidence groups={evidenceGroups} />
        ) : null;
      })()}

      {item.createdAt ? (
        <Text style={[styles.postedDate, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={2}>
          Posted {new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
      ) : null}
    </CommerceDetailSection>
  );
}

const styles = StyleSheet.create({
  quietTextTarget: {
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  // ── Inline condition evidence ──
  // Flat block inside "Item details": dot + grade, plain-English
  // definition, and a quiet media-evidence jump. No card — the canvas
  // and spacing carry the grouping.
  conditionEvidence: {
    gap: Space.xs,
    paddingBottom: Space.md,
  },
  conditionEvidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  conditionDot: {
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: (Space.xs + 2) / 2,
    flexShrink: 0,
  },
  conditionEvidenceName: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  conditionEvidenceDefinition: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + Space.xs,
    fontFamily: FontFamily.regular,
  },
  // ── Condition evidence gallery jump ──
  conditionEvidenceJump: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    minHeight: Control.hit,
  },
  conditionEvidenceJumpText: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
  },
  // ── Description ──
  // Tighter gap (Space.xs) so the "Read more" toggle reads as part of
  // the description block, not a disconnected separate element.
  descriptionWrap: {
    gap: Space.xs,
    paddingBottom: Space.sm,
  },
  // Gradient fade overlay at the bottom of collapsed description text.
  // Visual signal that there's more content below — replaces the bare
  // text link that buyers often miss.
  descriptionFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: Space.lg + Space.xs,
  },
  // Description text — 14px body with 26px line height (body + sm)
  // for generous scannability. Per 2026 PDP research: description copy
  // should be readable, not cramped. The extra 2px over the former
  // 24px line height gives each line breathing room without making
  // the block feel airy.
  descriptionText: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + Space.sm,
    fontFamily: FontFamily.regular,
  },
  descriptionToggle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
    alignSelf: 'flex-start',
    paddingTop: Space.xs,
  },
  postedDate: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    paddingTop: Space.xs,
    fontVariant: ['tabular-nums'],
  },
});
