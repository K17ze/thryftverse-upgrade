/**
 * CropTopBar — close · undo · reset (dirty) · done header row for
 * CreatorCropSheet. Extracted verbatim from the sheet's JSX; handlers are
 * passed in as props, theme/labels are pulled from the same contexts.
 */
import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { AppIcon } from '../../../components/common/AppIcon';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useAppTranslation } from '../../../i18n/useAppTranslation';
import { PressScale } from '../../shared/CreatorAnimations';
import { cropSheetStyles as styles } from './cropSheetStyles';

interface CropTopBarProps {
  onClose: () => void;
  onUndo: () => void;
  canUndo: boolean;
  isDirty: boolean;
  onResetAll: () => void;
  onDone: () => void;
  isProcessing: boolean;
  imageLoadFailed: boolean;
}

export function CropTopBar({
  onClose,
  onUndo,
  canUndo,
  isDirty,
  onResetAll,
  onDone,
  isProcessing,
  imageLoadFailed }: CropTopBarProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('creator');

  return (
    <View style={styles.topBar}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <PressScale
          onPress={onClose}
          style={styles.topBtn}
          accessibilityLabel="Close crop"
          accessibilityHint="Closes without cropping"
          accessibilityRole="button"
        >
          <AppIcon name="close" size={22} color="textPrimary" opticalCenter={true} accessible={false} />
        </PressScale>
        <PressScale
          onPress={onUndo}
          disabled={!canUndo}
          style={[styles.topBtn, { opacity: canUndo ? 1 : 0.35 }]}
          accessibilityLabel="Undo last edit"
          accessibilityHint="Restores the previous crop, rotation, flip, straighten and framing"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canUndo }}
        >
          <AppIcon name="arrow-undo-outline" size={22} color="textPrimary" opticalCenter={true} accessible={false} />
        </PressScale>
      </View>

      {isDirty ? (
        <PressScale
          onPress={onResetAll}
          style={styles.resetBtn}
          accessibilityLabel="Reset all edits"
          accessibilityHint="Restores the original photo, ratio, angle, flips and focal point"
          accessibilityRole="button"
        >
          <Text style={[styles.resetText, { color: colors.textSecondary }]}>
            {t('crop.reset')}
          </Text>
        </PressScale>
      ) : (
        <View style={styles.resetBtn} />
      )}

      <PressScale
        onPress={onDone}
        disabled={isProcessing || imageLoadFailed}
        style={[styles.doneBtn, { backgroundColor: colors.brand, opacity: isProcessing ? 0.5 : 1 }]}
        accessibilityLabel="Apply crop"
        accessibilityHint="Applies the crop"
        accessibilityRole="button"
        accessibilityState={{ disabled: isProcessing }}
      >
        {isProcessing
          ? <ActivityIndicator size="small" color={colors.textInverse} />
          : (
            <Text style={[styles.doneText, { color: colors.textInverse }]}>
              {t('crop.done')}
            </Text>
          )}
      </PressScale>
    </View>
  );
}
