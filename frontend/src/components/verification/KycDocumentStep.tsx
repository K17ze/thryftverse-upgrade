import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { FlagshipState } from '../flagship';
import { AnimatedPressable } from '../AnimatedPressable';
import { VerificationFlowNav } from './VerificationFlowNav';
import { createVerificationScreenStyles } from './verificationScreenStyles';
import {
  KYC_DOCUMENT_TYPES,
  kycDocumentSelectLabel,
  kycDocumentTypeIcon,
  kycDocumentTypeLabel,
  kycDocumentTypeNoun,
  type KycDocumentType } from '../../domain/verification';

export interface KycDocumentStepProps {
  documentType: KycDocumentType;
  onSelectDocumentType: (t: KycDocumentType) => void;
  /** Public URL of the uploaded document photo (null until uploaded). */
  documentUri: string | null;
  isUploading: boolean;
  onPickDocument: () => void;
  onTakePhoto: () => void;
  onRemoveDocument: () => void;
  onBack: () => void;
  onContinue: () => void;
}

/** KYC step 2 — document-type picker plus photo upload / preview. */
export function KycDocumentStep({
  documentType,
  onSelectDocumentType,
  documentUri,
  isUploading,
  onPickDocument,
  onTakePhoto,
  onRemoveDocument,
  onBack,
  onContinue }: KycDocumentStepProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createVerificationScreenStyles(colors), [colors]);
  return (
    <>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Document type</Text>
      {KYC_DOCUMENT_TYPES.map((doc) => (
        <Pressable
          key={doc}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[
            styles.docOption,
            {
              borderColor: documentType === doc ? colors.brand : colors.border,
              backgroundColor: documentType === doc ? colors.brandSubtle : colors.surfaceAlt },
          ]}
          onPress={() => onSelectDocumentType(doc)}
          accessibilityRole="button"
          accessibilityState={{ selected: documentType === doc }}
          accessibilityLabel={kycDocumentSelectLabel(doc)}
        >
          <Ionicons
            name={kycDocumentTypeIcon(doc)}
            size={20}
            color={documentType === doc ? colors.brand : colors.textSecondary}
          />
          <Text style={[styles.docOptionText, { color: documentType === doc ? colors.brand : colors.textPrimary }]}>
            {kycDocumentTypeLabel(doc)}
          </Text>
          {documentType === doc ? (
            <Ionicons name="checkmark-circle" size={18} color={colors.brand} />
          ) : null}
        </Pressable>
      ))}
      {documentUri ? (
        <View style={styles.uploadPreview}>
          <Image
            source={{ uri: documentUri }}
            style={styles.previewImage}
            resizeMode="cover"
            accessibilityLabel="Uploaded ID document preview"
          />
          <View style={styles.previewActions}>
            <Pressable
              onPress={onPickDocument}
              disabled={isUploading}
              accessibilityRole="button"
              accessibilityLabel="Replace document"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.previewActionText, { color: colors.brand }]}>
                {isUploading ? 'Uploading...' : 'Replace'}
              </Text>
            </Pressable>
            <View style={[styles.previewActionDivider, { backgroundColor: colors.border }]} />
            <Pressable
              onPress={onRemoveDocument}
              disabled={isUploading}
              accessibilityRole="button"
              accessibilityLabel="Remove document"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.previewActionText, { color: colors.textSecondary }]}>
                Remove
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.uploadPlaceholder}>
          {isUploading ? (
            <FlagshipState
              variant="loading"
              title="Uploading your document..."
              style={{ paddingVertical: Space.xl }}
            />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={32} color={colors.textMuted} />
              <Text style={[styles.uploadText, { color: colors.textMuted }]}>
                Upload a clear photo of your {kycDocumentTypeNoun(documentType)}
              </Text>
              <View style={styles.uploadBtnRow}>
                <AnimatedPressable
                  style={styles.uploadBtn}
                  onPress={onPickDocument}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel="Choose photo from library"
                >
                  <Ionicons name="images-outline" size={16} color={colors.textPrimary} style={{ marginRight: Space.xs }} />
                  <Text style={styles.uploadBtnText}>Choose photo</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.uploadBtn}
                  onPress={onTakePhoto}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel="Take photo with camera"
                >
                  <Ionicons name="camera-outline" size={16} color={colors.textPrimary} style={{ marginRight: Space.xs }} />
                  <Text style={styles.uploadBtnText}>Take photo</Text>
                </AnimatedPressable>
              </View>
            </>
          )}
        </View>
      )}
      <VerificationFlowNav
        onBack={onBack}
        backLabel="Back"
        backAccessibilityLabel="Back to identity step"
        onPrimary={onContinue}
        primaryLabel="Continue to review"
        primaryAccessibilityLabel="Continue to review"
      />
    </>
  );
}
