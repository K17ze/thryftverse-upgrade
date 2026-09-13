import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useToast } from '../../context/ToastContext';
import { useConnectivity } from '../useConnectivity';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { uploadMedia } from '../../services/mediaUpload';
import { MAX_REPORT_EVIDENCE } from '../../utils/reportLogic';
import type { EvidenceItem } from '../../utils/reportLogic';

export interface UseReportEvidenceResult {
  evidenceItems: EvidenceItem[];
  isUploading: boolean;
  pickEvidence: () => Promise<void>;
  takeEvidence: () => Promise<void>;
  removeEvidence: (id: string) => void;
  markEvidenceSubmitted: () => void;
}

/**
 * Evidence photo handling for ReportScreen — gallery pick, camera take,
 * upload placeholders, per-item removal. Uploads go through
 * `uploadMedia(uri, 'evidence')`; failed uploads drop their placeholder.
 */
export function useReportEvidence(): UseReportEvidenceResult {
  const { show } = useToast();
  const { isOffline } = useConnectivity();
  const { t } = useAppTranslation('report');
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const pickEvidence = useCallback(async () => {
    if (evidenceItems.length >= MAX_REPORT_EVIDENCE) {
      show(t('toast.attachUpTo3'), 'info');
      return;
    }
    if (isOffline) {
      show(t('toast.offline'), 'error');
      return;
    }
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        show(t('toast.allowPhotoAccess'), 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
        selectionLimit: MAX_REPORT_EVIDENCE - evidenceItems.length });
      if (result.canceled || !result.assets?.length) return;
      const placeholders: EvidenceItem[] = result.assets.map((_, idx) => ({
        id: `pick_${Date.now()}_${idx}`,
        uri: '',
        state: 'uploading' }));
      setEvidenceItems((prev) => [...prev, ...placeholders]);
      setIsUploading(true);
      let successCount = 0;
      for (let i = 0; i < result.assets.length; i++) {
        try {
          const media = await uploadMedia(result.assets[i].uri, 'evidence');
          setEvidenceItems((prev) =>
            prev.map((it) =>
              it.id === placeholders[i].id
                ? { ...it, uri: media.publicUrl, state: 'attached' }
                : it
            )
          );
          successCount++;
        } catch {
          setEvidenceItems((prev) => prev.filter((it) => it.id !== placeholders[i].id));
        }
      }
      if (successCount > 0) {
        show(t('toast.photosAttached', { count: successCount }), 'success');
      } else {
        show(t('toast.uploadFailed'), 'error');
      }
    } catch {
      show(t('toast.uploadFailed'), 'error');
    } finally {
      setIsUploading(false);
    }
  }, [evidenceItems.length, isOffline, show, t]);

  const takeEvidence = useCallback(async () => {
    if (evidenceItems.length >= MAX_REPORT_EVIDENCE) {
      show(t('toast.attachUpTo3'), 'info');
      return;
    }
    if (isOffline) {
      show(t('toast.offline'), 'error');
      return;
    }
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        show(t('toast.allowCameraAccess'), 'error');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85 });
      if (result.canceled || !result.assets?.length) return;
      const placeholder: EvidenceItem = {
        id: `cam_${Date.now()}`,
        uri: '',
        state: 'uploading' };
      setEvidenceItems((prev) => [...prev, placeholder]);
      setIsUploading(true);
      try {
        const media = await uploadMedia(result.assets[0].uri, 'evidence');
        setEvidenceItems((prev) =>
          prev.map((it) =>
            it.id === placeholder.id
              ? { ...it, uri: media.publicUrl, state: 'attached' }
              : it
          )
        );
        show(t('toast.photoAttached'), 'success');
      } catch {
        setEvidenceItems((prev) => prev.filter((it) => it.id !== placeholder.id));
        show(t('toast.singleUploadFailed'), 'error');
      }
    } catch {
      show(t('toast.singleUploadFailed'), 'error');
    } finally {
      setIsUploading(false);
    }
  }, [evidenceItems.length, isOffline, show, t]);

  const removeEvidence = useCallback((id: string) => {
    setEvidenceItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const markEvidenceSubmitted = useCallback(() => {
    setEvidenceItems((prev) => prev.map((it) => ({ ...it, state: 'submitted' as const })));
  }, []);

  return {
    evidenceItems,
    isUploading,
    pickEvidence,
    takeEvidence,
    removeEvidence,
    markEvidenceSubmitted,
  };
}
