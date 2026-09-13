import React from 'react';
import { ActivityIndicator, Image as RNImage, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { EvidenceItem } from '../../utils/reportLogic';
import type { ReportScreenStyles } from './reportScreenStyles';

interface ReportEvidenceGridProps {
  items: EvidenceItem[];
  /**
   * `editable` — pre-submit grid: placeholders while uploading, attached
   * badge, per-tile remove action.
   * `submitted` — post-submit strip: image + submitted badge only.
   */
  mode: 'editable' | 'submitted';
  styles: ReportScreenStyles;
  onRemove?: (id: string) => void;
}

/**
 * Evidence photo grid for ReportScreen. Rendering is mode-locked to the
 * two call sites it was extracted from — tile chrome is identical, only
 * the affordances differ.
 */
export function ReportEvidenceGrid({ items, mode, styles, onRemove }: ReportEvidenceGridProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('report');

  if (mode === 'submitted') {
    return (
      <View style={styles.submittedEvidence}>
        {items.map((item) => (
          <View key={item.id} style={styles.evidenceTileWrap}>
            <RNImage
              source={{ uri: item.uri }}
              style={styles.evidenceTile}
              resizeMode="cover"
            />
            <View style={styles.evidenceStateBadge}>
              <Ionicons name="checkmark" size={12} color={colors.textInverse} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.evidenceGrid}>
      {items.map((item, i) => (
        <View key={item.id} style={styles.evidenceTileWrap}>
          {item.uri ? (
            <RNImage
              source={{ uri: item.uri }}
              style={styles.evidenceTile}
              resizeMode="cover"
              accessibilityLabel={t('accessibility.evidencePhoto', { index: i + 1 })}
            />
          ) : (
            <View style={[styles.evidenceTile, styles.evidenceTilePlaceholder]} />
          )}
          {item.state === 'uploading' ? (
            <View style={styles.evidenceStateOverlay}>
              <ActivityIndicator size="small" color={colors.textPrimary} />
            </View>
          ) : null}
          {item.state === 'attached' ? (
            <View style={styles.evidenceStateBadge}>
              <Ionicons name="checkmark" size={12} color={colors.textInverse} />
            </View>
          ) : null}
          {item.state === 'attached' ? (
            <Pressable
              style={styles.evidenceRemoveBtn}
              onPress={() => onRemove?.(item.id)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.removeEvidencePhoto', { index: i + 1 })}
            >
              <Ionicons name="close-circle" size={22} color={colors.danger} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}
