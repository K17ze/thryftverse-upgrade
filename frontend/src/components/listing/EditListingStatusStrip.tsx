import React from 'react';
import { View, Text } from 'react-native';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { t } from '../../i18n';
import { editListingStyles as styles, useEditListingThemedStyles } from './editListingStyles';

interface EditListingStatusStripProps {
  /** Localized status label — null hides the status row entirely. */
  statusLabel: string | null;
  statusActive: boolean;
  isEditingRestricted: boolean;
}

/**
 * The listing status/context strip under the media studio: the coloured
 * status dot + label, and the lock notice shown when editing is restricted
 * (sold/deleted listing or non-owner). Extracted verbatim from
 * EditListingScreen.
 */
export function EditListingStatusStrip({
  statusLabel,
  statusActive,
  isEditingRestricted,
}: EditListingStatusStripProps) {
  const themed = useEditListingThemedStyles();
  return (
    <>
      {statusLabel && (
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, themed.statusDot, statusActive && styles.statusDotActive, statusActive && themed.statusDotActive]} />
          <Text style={[styles.statusText, themed.statusText]}>{statusLabel}</Text>
        </View>
      )}

      {isEditingRestricted && (
        <View style={styles.restrictedRow}>
          <AppIcon name="lock-closed" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
          <Text style={[styles.restrictedText, themed.restrictedText]}>{t('listing.edit.restricted')}</Text>
        </View>
      )}
    </>
  );
}
