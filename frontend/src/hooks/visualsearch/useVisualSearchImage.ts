import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useHaptic } from '../useHaptic';
import { useToast } from '../../context/ToastContext';

// Image-capture domain for VisualSearchScreen: the selected photo URI, its
// preview-failure flag, camera-capture handoff and gallery picking. The
// preview-failed reset effect lives in the orchestrator so effect ordering
// stays identical to the pre-extraction screen.
export function useVisualSearchImage(initialImageUri?: string) {
  const haptic = useHaptic();
  const { show } = useToast();

  const [imageUri, setImageUri] = useState<string | null>(initialImageUri ?? null);
  const [previewFailed, setPreviewFailed] = useState(false);

  const handlePhotoCapture = useCallback((uri: string) => {
    haptic.medium();
    setPreviewFailed(false);
    setImageUri(uri);
  }, [haptic]);

  const openGallery = useCallback(async () => {
    haptic.selection();
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        show('Photo library access required', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.92 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        haptic.light();
        setPreviewFailed(false);
        setImageUri(result.assets[0].uri);
      }
    } catch {
      show('Could not open photo library', 'error');
    }
  }, [haptic, show]);

  return {
    imageUri,
    setImageUri,
    previewFailed,
    setPreviewFailed,
    handlePhotoCapture,
    openGallery };
}
