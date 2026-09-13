import React from 'react';
import { View, Text, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme } from '../../theme/ThemeContext';
import { createVisualSearchStyles } from './visualSearchStyles';

interface Props {
  imageUri: string;
  previewFailed: boolean;
  onPreviewError: () => void;
  onRemove: () => void;
  onRetake: () => void;
  onReplace: () => void;
}

// ── Visual-query header (photo selected) ─────────────────────────────────
// No scanline animation or corner brackets — the backend is a colour
// heuristic, not AI. A loading indicator on the thumbnail would imply
// ML analysis that isn't happening. The honest loading state is a
// progress label on the results section, not AI theatre on the photo.
function VisualSearchQueryHeaderBase({
  imageUri,
  previewFailed,
  onPreviewError,
  onRemove,
  onRetake,
  onReplace,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createVisualSearchStyles(colors), [colors]);

  return (
    <View style={styles.queryHeader}>
      <View style={styles.queryThumbWrap}>
        {previewFailed ? (
          <View style={styles.queryThumb}>
            <Ionicons name="image-outline" size={24} color={colors.textMuted} />
          </View>
        ) : (
          <Image
            source={{ uri: imageUri }}
            style={styles.queryThumb}
            resizeMode="cover"
            onError={onPreviewError}
            accessibilityLabel="Your selected image for visual search"
            accessibilityRole="image"
          />
        )}
        <AnimatedPressable
          style={styles.queryThumbRemove}
          onPress={onRemove}
          activeOpacity={0.85}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Remove photo and start over"
          accessibilityHint="Removes the photo and returns to the camera"
        >
          <Ionicons name="close-circle" size={22} color={colors.textInverse} />
        </AnimatedPressable>
      </View>

      <View style={styles.queryActions}>
        <AnimatedPressable
          style={styles.queryActionBtn}
          onPress={onRetake}
          activeOpacity={0.85}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Retake photo with camera"
          accessibilityHint="Returns to the camera to capture a new photo"
        >
          <Ionicons name="camera-outline" size={18} color={colors.textPrimary} />
          <Text style={styles.queryActionText}>Retake</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.queryActionBtn}
          onPress={onReplace}
          activeOpacity={0.85}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Replace photo from gallery"
          accessibilityHint="Opens your photo library to pick a different image"
        >
          <Ionicons name="swap-horizontal-outline" size={18} color={colors.textPrimary} />
          <Text style={styles.queryActionText}>Replace</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const VisualSearchQueryHeader = React.memo(VisualSearchQueryHeaderBase);
VisualSearchQueryHeader.displayName = 'VisualSearchQueryHeader';
export { VisualSearchQueryHeader };
