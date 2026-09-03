import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Space, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import type { ThemeColors } from '../../theme/ThemeContext';
import type { Listing } from '../../services/listingsApi';
import { resolveEvidenceGroups } from '../../platform/commerce/categoryEvidence';
import { CategoryEvidence } from '../commerce';

// ───────────────────────────────────────────────────────────────────────────
// ProductDescriptionSection — Zone D progressive-disclosure description.
//
// Description + condition + category evidence + posted date. The entire
// collapsed text is the tap target (not just "Read more"). A gradient fade
// signals more content below when collapsed. Behaviour is identical to the
// previous inline block.
// ───────────────────────────────────────────────────────────────────────────

export interface ProductDescriptionSectionProps {
  item: Listing;
  descriptionExpanded: boolean;
  setDescriptionExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  colors: ThemeColors;
}

export function ProductDescriptionSection({
  item,
  descriptionExpanded,
  setDescriptionExpanded,
  colors,
}: ProductDescriptionSectionProps) {
  return (
    <>
      {item.description ? (
        <View style={styles.descriptionWrap}>
          {/* Full-area tap target — the entire collapsed text is tappable,
              not just the "Read more" link. Buyers often do not notice
              that a description can be expanded via a small "see more"
              link, so the whole collapsed block is the hit target. */}
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
            {/* Gradient fade at the collapse edge when collapsed. Visual
                signal that there's more content below. */}
            {!descriptionExpanded && item.description.length > 120 && (
              <LinearGradient
                // NOTE: hex-alpha required for gradient stops — token substitution not applicable
                colors={[`${colors.background}00`, colors.background]}
                style={styles.descriptionFade}
                pointerEvents="none"
              />
            )}
          </Pressable>
          {item.description.length > 120 && (
            <Pressable
              onPress={() => setDescriptionExpanded((prev) => !prev)}
              hitSlop={8}
              style={styles.quietTextTarget}
              accessibilityLabel={descriptionExpanded ? 'Show less' : 'Read more'}
              accessibilityRole="button"
              accessibilityState={{ expanded: descriptionExpanded }}
            >
              <Text style={[styles.descriptionToggle, { color: colors.textSecondary }]} maxFontSizeMultiplier={1}>
                {descriptionExpanded ? 'Show less' : 'Read more'}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {(() => {
        // ── Category evidence ──
        // resolveEvidenceGroups() supports car/yacht fields plus
        // watch/art/electronics extras. The Listing model does not yet
        // declare these fields, so we read them dynamically from the
        // listing object. When the backend schema is extended to return
        // them, they will flow through here without further frontend
        // changes. Until then only the known fields are guaranteed.
        const dynamicItem = item as unknown as Record<string, string | null | undefined>;
        const pickStr = (key: string): string | null | undefined => {
          const value = dynamicItem[key];
          return typeof value === 'string' ? value : null;
        };
        const evidenceGroups = resolveEvidenceGroups({
          category: item.category,
          subcategory: item.subcategory,
          brand: item.brand,
          size: item.size,
          condition: item.condition,
          description: item.description,
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
        <Text style={[styles.postedDate, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1}>
          Posted {new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  descriptionWrap: {
    gap: Space.xs,
    paddingBottom: Space.sm,
  },
  descriptionFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: Space.lg + Space.xs,
  },
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
  quietTextTarget: {
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  postedDate: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    paddingTop: Space.xs,
    fontVariant: ['tabular-nums'],
  },
});
