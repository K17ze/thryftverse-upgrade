import React from 'react';
import { Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useToast } from '../../context/ToastContext';
import { useStore } from '../../store/useStore';
import { useConnectivity } from '../useConnectivity';
import { createKycSession } from '../../services/complianceApi';
import { uploadMedia } from '../../services/mediaUpload';
import { parseApiError } from '../../lib/apiClient';
import {
  isKycIdentityFormComplete,
  toIsoDateOfBirth,
  type KycDocumentType,
  type KycStep } from '../../domain/verification';

export interface UseKycFlowOptions {
  /** Backend-authoritative verified flag — guards re-entering the flow. */
  kycVerified: boolean;
  /** Re-fetch KYC status after a successful session submission. */
  refreshKycStatus: () => Promise<void>;
}

export interface UseKycFlowResult {
  step: KycStep;
  fullName: string;
  setFullName: (v: string) => void;
  dob: string;
  setDob: (v: string) => void;
  addressLine: string;
  setAddressLine: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  postcode: string;
  setPostcode: (v: string) => void;
  documentType: KycDocumentType;
  setDocumentType: (t: KycDocumentType) => void;
  /** Public URL of the uploaded document photo, once uploaded. */
  documentUri: string | null;
  isUploadingDocument: boolean;
  isSubmitting: boolean;
  /** Status-row press: toast-guard for verified users, then opens the flow. */
  start: () => void;
  /** Close button: back to the status surface. */
  cancel: () => void;
  continueToDocument: () => void;
  continueToReview: () => void;
  backToIdentity: () => void;
  backToDocument: () => void;
  pickDocument: () => Promise<void>;
  takeDocumentPhoto: () => Promise<void>;
  removeDocument: () => void;
  submit: () => Promise<void>;
}

/**
 * useKycFlow — owns the identity-verification step machine
 * (status → identity → document → review), the form fields, the ID-document
 * pick/capture/upload wiring, and the KYC-session submission.
 */
export function useKycFlow({
  kycVerified,
  refreshKycStatus }: UseKycFlowOptions): UseKycFlowResult {
  const { show } = useToast();
  const { isOffline } = useConnectivity();
  const currentUser = useStore((state) => state.currentUser);
  const updateCoOwnCompliance = useStore((state) => state.updateCoOwnCompliance);

  const [step, setStep] = React.useState<KycStep>('status');
  const [fullName, setFullName] = React.useState('');
  const [dob, setDob] = React.useState('');
  const [addressLine, setAddressLine] = React.useState('');
  const [city, setCity] = React.useState('');
  const [postcode, setPostcode] = React.useState('');
  const [country] = React.useState('GB');
  const [documentType, setDocumentType] = React.useState<KycDocumentType>('passport');
  const [documentUri, setDocumentUri] = React.useState<string | null>(null);
  const [isUploadingDocument, setIsUploadingDocument] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const start = React.useCallback(() => {
    if (kycVerified) {
      show('Your identity is already verified', 'info');
      return;
    }
    setStep('identity');
  }, [kycVerified, show]);

  const cancel = React.useCallback(() => setStep('status'), []);
  const continueToDocument = React.useCallback(() => setStep('document'), []);
  const continueToReview = React.useCallback(() => setStep('review'), []);
  const backToIdentity = React.useCallback(() => setStep('identity'), []);
  const backToDocument = React.useCallback(() => setStep('document'), []);
  const removeDocument = React.useCallback(() => setDocumentUri(null), []);

  const uploadKycDocument = React.useCallback(async (uri: string) => {
    setIsUploadingDocument(true);
    try {
      const uploaded = await uploadMedia(uri, 'kyc');
      setDocumentUri(uploaded.publicUrl);
      show('Document uploaded successfully.', 'success');
    } catch (uploadErr) {
      const isNetworkError = isOffline || (uploadErr instanceof Error && /network|fetch|timeout/i.test(uploadErr.message));
      const parsed = parseApiError(uploadErr, isNetworkError ? 'You appear to be offline. Check your connection and try again.' : 'Could not upload document.');
      show(parsed.message, 'error');
    } finally {
      setIsUploadingDocument(false);
    }
  }, [isOffline, show]);

  const pickDocument = React.useCallback(async () => {
    if (isUploadingDocument) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        show('Allow photo access to upload your ID document.', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 0.85 });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      await uploadKycDocument(result.assets[0].uri);
    } catch {
      show('Could not open photo library.', 'error');
    }
  }, [isUploadingDocument, show, uploadKycDocument]);

  const takeDocumentPhoto = React.useCallback(async () => {
    if (isUploadingDocument) return;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        show('Allow camera access to photograph your ID document.', 'error');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85 });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      await uploadKycDocument(result.assets[0].uri);
    } catch {
      show('Could not open camera.', 'error');
    }
  }, [isUploadingDocument, show, uploadKycDocument]);

  const submit = React.useCallback(async () => {
    if (!isKycIdentityFormComplete({ fullName, dob, addressLine, city, postcode })) {
      show('Fill in all fields', 'error');
      return;
    }
    if (!currentUser?.id) {
      show('Log in to verify your identity', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      // Call the real backend KYC session endpoint. The contract requires
      // ISO `YYYY-MM-DD` — the UI collects `DD/MM/YYYY`, so convert here.
      const result = await createKycSession({
        legalName: fullName.trim(),
        dateOfBirth: toIsoDateOfBirth(dob),
        countryCode: country });

      // Update local compliance state
      updateCoOwnCompliance({ kycVerified: false });

      // If the provider returned a verification URL, open it
      if (result.session.verificationUrl) {
        show('Opening identity verification...', 'success');
        const canOpen = await Linking.canOpenURL(result.session.verificationUrl);
        if (canOpen) {
          await Linking.openURL(result.session.verificationUrl);
        }
        show('Complete verification in your browser. We\'ll review within 24 hours.', 'success');
      } else {
        // Provider not configured — submission is recorded as pending
        show('Identity verification submitted. We\'ll review your documents within 24 hours.', 'success');
      }

      // Refresh backend status
      await refreshKycStatus();

      setStep('status');
    } catch (err) {
      const isNetworkError = isOffline || (err instanceof Error && /network|fetch|timeout/i.test(err.message));
      const parsed = parseApiError(err, isNetworkError ? 'You appear to be offline. Check your connection and try again.' : undefined);
      show(parsed.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    fullName, dob, addressLine, city, postcode, country,
    currentUser?.id, updateCoOwnCompliance, refreshKycStatus,
    isOffline, show,
  ]);

  return {
    step,
    fullName, setFullName,
    dob, setDob,
    addressLine, setAddressLine,
    city, setCity,
    postcode, setPostcode,
    documentType, setDocumentType,
    documentUri,
    isUploadingDocument,
    isSubmitting,
    start,
    cancel,
    continueToDocument,
    continueToReview,
    backToIdentity,
    backToDocument,
    pickDocument,
    takeDocumentPhoto,
    removeDocument,
    submit,
  };
}
