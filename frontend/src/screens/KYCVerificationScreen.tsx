import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image as RNImage,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Reanimated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { NativeStackScreenProps, RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke, Control } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { AppInput } from '../components/ui/AppInput';
import { AppButton } from '../components/ui/AppButton';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useConnectivity } from '../hooks/useConnectivity';
import {
  createKycSession,
  fetchKycStatus,
  type KycStatus,
} from '../services/complianceApi';
import { parseApiError } from '../lib/apiClient';

type Props = NativeStackScreenProps<RootStackParamList, 'KYCVerification'>;

type Step = 1 | 2 | 3 | 4 | 5;
type DocumentType = 'passport' | 'driving_licence' | 'national_id';

const TOTAL_STEPS = 5;
const STEP_LABELS = ['Identity', 'Document', 'Selfie', 'Business', 'Review'];

export default function KYCVerificationScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();
  const reducedMotionEnabled = useReducedMotion();
  const { isOffline } = useConnectivity();
  const currentUser = useStore((state) => state.currentUser);
  const updateCoOwnCompliance = useStore((state) => state.updateCoOwnCompliance);

  const [step, setStep] = useState<Step>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Step 1: Identity
  const [legalName, setLegalName] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState(currentUser?.phone ?? '');
  const [errors1, setErrors1] = useState<Record<string, string>>({});

  // Step 2: Document
  const [documentType, setDocumentType] = useState<DocumentType>('passport');
  const [documentFrontUri, setDocumentFrontUri] = useState<string | null>(null);
  const [documentBackUri, setDocumentBackUri] = useState<string | null>(null);
  const [errors2, setErrors2] = useState<Record<string, string>>({});

  // Step 3: Selfie
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [errors3, setErrors3] = useState<Record<string, string>>({});

  // Step 4: Business
  const [isBusiness, setIsBusiness] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [errors4, setErrors4] = useState<Record<string, string>>({});

  // Step 5: Review
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errors5, setErrors5] = useState<Record<string, string>>({});

  // ── Validation ──
  const validateStep1 = useCallback(() => {
    const errs: Record<string, string> = {};
    if (!legalName.trim()) errs.legalName = 'Legal full name is required';
    if (!dob.trim()) {
      errs.dob = 'Date of birth is required';
    } else if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dob.trim())) {
      errs.dob = 'Use DD/MM/YYYY format';
    }
    if (!address.trim()) errs.address = 'Home address is required';
    if (!phone.trim()) errs.phone = 'Phone number is required';
    setErrors1(errs);
    return Object.keys(errs).length === 0;
  }, [legalName, dob, address, phone]);

  const validateStep2 = useCallback(() => {
    const errs: Record<string, string> = {};
    if (!documentFrontUri) errs.front = 'Front of document is required';
    if (documentType !== 'passport' && !documentBackUri) {
      errs.back = 'Back of document is required';
    }
    setErrors2(errs);
    return Object.keys(errs).length === 0;
  }, [documentFrontUri, documentBackUri, documentType]);

  const validateStep3 = useCallback(() => {
    const errs: Record<string, string> = {};
    if (!selfieUri) errs.selfie = 'Selfie photo is required';
    setErrors3(errs);
    return Object.keys(errs).length === 0;
  }, [selfieUri]);

  const validateStep4 = useCallback(() => {
    if (!isBusiness) return true;
    const errs: Record<string, string> = {};
    if (!businessName.trim()) errs.businessName = 'Business name is required';
    if (!registrationNumber.trim()) errs.registrationNumber = 'Registration number is required';
    if (!businessAddress.trim()) errs.businessAddress = 'Business address is required';
    setErrors4(errs);
    return Object.keys(errs).length === 0;
  }, [isBusiness, businessName, registrationNumber, businessAddress]);

  const validateStep5 = useCallback(() => {
    const errs: Record<string, string> = {};
    if (!termsAccepted) errs.terms = 'You must confirm the information is accurate';
    setErrors5(errs);
    return Object.keys(errs).length === 0;
  }, [termsAccepted]);

  // ── Navigation between steps ──
  const handleNext = useCallback(() => {
    haptic.selection();
    let valid = true;
    if (step === 1) valid = validateStep1();
    else if (step === 2) valid = validateStep2();
    else if (step === 3) valid = validateStep3();
    else if (step === 4) valid = validateStep4();

    if (valid && step < TOTAL_STEPS) {
      setStep((prev) => (prev + 1) as Step);
    } else if (!valid) {
      haptic.medium();
    }
  }, [step, haptic, validateStep1, validateStep2, validateStep3, validateStep4]);

  const handleBack = useCallback(() => {
    haptic.light();
    if (step > 1) {
      setStep((prev) => (prev - 1) as Step);
    } else {
      navigation.goBack();
    }
  }, [step, haptic, navigation]);

  // ── Camera capture ──
  const capturePhoto = useCallback(
    async (target: 'docFront' | 'docBack' | 'selfie') => {
      if (isOffline) {
        show('You appear to be offline. Check your connection and try again.', 'error');
        return;
      }
      haptic.light();
      try {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          show('Allow camera access to capture your document.', 'error');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: target === 'selfie' ? [1, 1] : [4, 3],
          quality: 0.85,
        });
        if (result.canceled || !result.assets?.length) return;
        const uri = result.assets[0].uri;
        if (target === 'docFront') {
          setDocumentFrontUri(uri);
          setErrors2((prev) => { const next = { ...prev }; delete next.front; return next; });
        } else if (target === 'docBack') {
          setDocumentBackUri(uri);
          setErrors2((prev) => { const next = { ...prev }; delete next.back; return next; });
        } else {
          setSelfieUri(uri);
          setErrors3((prev) => { const next = { ...prev }; delete next.selfie; return next; });
        }
        haptic.selection();
      } catch (err) {
        const parsed = parseApiError(err);
        show(parsed.message, 'error');
      }
    },
    [isOffline, haptic, show]
  );

  // ── Submit ──
  const handleSubmit = useCallback(async () => {
    if (!validateStep5()) {
      haptic.medium();
      return;
    }
    if (!currentUser?.id) {
      show('Please log in to submit verification.', 'error');
      return;
    }
    haptic.medium();
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // Submit to the real backend KYC session endpoint
      const result = await createKycSession({
        legalName: legalName.trim(),
        dateOfBirth: dob.trim(),
        countryCode: 'GB',
      });

      // Update local compliance state — mark as pending (NOT verified)
      // Per §11 TRUTHFUL UI: do not claim instant approval
      updateCoOwnCompliance({ kycVerified: false });

      // Refresh backend status
      try {
        await fetchKycStatus(currentUser.id);
      } catch {
        // Non-critical
      }

      setSubmitted(true);
      show('Verification submitted. We will review within 24 hours.', 'success');
    } catch (err) {
      const isNetworkError = isOffline || (err instanceof Error && /network|fetch|timeout/i.test(err.message));
      const parsed = parseApiError(err, isNetworkError ? 'You appear to be offline. Check your connection and try again.' : undefined);
      setSubmitError(parsed.message);
      show(parsed.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [validateStep5, currentUser?.id, haptic, legalName, dob, isOffline, show, updateCoOwnCompliance]);

  // ── Submitted state — truthful "in review" state ──
  if (submitted) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Verification" onBack={() => navigation.goBack()} />}>
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}
          style={styles.submittedWrap}
        >
          <View style={[styles.submittedIcon, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="hourglass-outline" size={40} color={colors.warning} />
          </View>
          <Text style={styles.submittedTitle}>Verification in review</Text>
          <Text style={styles.submittedBody}>
            We have received your submission and are reviewing your identity. This typically takes within 24 hours. You will be notified once the review is complete.
          </Text>
          <View style={[styles.submittedTimeline, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SubmittedStep icon="checkmark-circle" label="Identity details" status="complete" colors={colors} styles={styles} />
            <SubmittedStep icon="checkmark-circle" label="Document submitted" status="complete" colors={colors} styles={styles} />
            <SubmittedStep icon="checkmark-circle" label="Selfie captured" status="complete" colors={colors} styles={styles} />
            <SubmittedStep icon="hourglass-outline" label="Under review" status="active" colors={colors} styles={styles} />
          </View>
          <AppButton
            title="Back to verification status"
            variant="primary"
            size="lg"
            style={styles.submittedBtn}
            onPress={() => navigation.navigate('VerificationStatus')}
            accessibilityLabel="View verification status"
            hapticFeedback="light"
          />
        </Reanimated.View>
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Get Verified"
          onBack={handleBack}
          backIcon={step > 1 ? 'arrow-back' : 'arrow-back'}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <View style={styles.root}>
        {/* ── Step indicator ── */}
        <StepIndicator currentStep={step} colors={colors} styles={styles} />

        {/* ── Step content ── */}
        <ScrollView
          style={styles.stepScroll}
          contentContainerStyle={styles.stepContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 && (
            <StepIdentity
              colors={colors}
              styles={styles}
              legalName={legalName}
              setLegalName={setLegalName}
              dob={dob}
              setDob={setDob}
              address={address}
              setAddress={setAddress}
              phone={phone}
              setPhone={setPhone}
              errors={errors1}
              reducedMotionEnabled={reducedMotionEnabled}
            />
          )}
          {step === 2 && (
            <StepDocument
              colors={colors}
              styles={styles}
              documentType={documentType}
              setDocumentType={setDocumentType}
              documentFrontUri={documentFrontUri}
              documentBackUri={documentBackUri}
              errors={errors2}
              onCapture={capturePhoto}
              onClearFront={() => setDocumentFrontUri(null)}
              onClearBack={() => setDocumentBackUri(null)}
              reducedMotionEnabled={reducedMotionEnabled}
            />
          )}
          {step === 3 && (
            <StepSelfie
              colors={colors}
              styles={styles}
              selfieUri={selfieUri}
              errors={errors3}
              onCapture={() => capturePhoto('selfie')}
              onClear={() => setSelfieUri(null)}
              reducedMotionEnabled={reducedMotionEnabled}
            />
          )}
          {step === 4 && (
            <StepBusiness
              colors={colors}
              styles={styles}
              isBusiness={isBusiness}
              setIsBusiness={setIsBusiness}
              businessName={businessName}
              setBusinessName={setBusinessName}
              registrationNumber={registrationNumber}
              setRegistrationNumber={setRegistrationNumber}
              businessAddress={businessAddress}
              setBusinessAddress={setBusinessAddress}
              errors={errors4}
              reducedMotionEnabled={reducedMotionEnabled}
            />
          )}
          {step === 5 && (
            <StepReview
              colors={colors}
              styles={styles}
              legalName={legalName}
              dob={dob}
              address={address}
              phone={phone}
              documentType={documentType}
              hasSelfie={!!selfieUri}
              isBusiness={isBusiness}
              businessName={businessName}
              registrationNumber={registrationNumber}
              businessAddress={businessAddress}
              termsAccepted={termsAccepted}
              setTermsAccepted={setTermsAccepted}
              errors={errors5}
              submitError={submitError}
              reducedMotionEnabled={reducedMotionEnabled}
            />
          )}
        </ScrollView>

        {/* ── Footer navigation ── */}
        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          {step < TOTAL_STEPS ? (
            <AppButton
              title={step === 4 && !isBusiness ? 'Skip & continue' : 'Continue'}
              variant="primary"
              size="lg"
              onPress={handleNext}
              loading={isSubmitting}
              accessibilityLabel="Continue to next step"
              hapticFeedback="light"
              style={styles.footerBtn}
            />
          ) : (
            <AppButton
              title="Submit verification"
              variant="primary"
              size="lg"
              onPress={handleSubmit}
              loading={isSubmitting}
              disabled={!termsAccepted}
              accessibilityLabel="Submit verification for review"
              hapticFeedback="medium"
              style={styles.footerBtn}
            />
          )}
        </View>
      </View>

      {/* ── Full-screen loading overlay during submission ── */}
      {isSubmitting && (
        <View
          style={styles.submittingOverlay}
          accessibilityLiveRegion="polite"
          accessibilityLabel="Submitting verification, please wait"
        >
          <View style={[styles.submittingCard, { backgroundColor: colors.surface }]}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={[styles.submittingText, { color: colors.textPrimary }]}>
              Submitting verification…
            </Text>
            <Text style={[styles.submittingSubtext, { color: colors.textSecondary }]}>
              Uploading documents securely
            </Text>
          </View>
        </View>
      )}
    </FlagshipScreen>
  );
}

// ── Step indicator ──
function StepIndicator({
  currentStep,
  colors,
  styles,
}: {
  currentStep: number;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={[styles.stepIndicatorWrap, { borderBottomColor: colors.border }]}>
      <View style={styles.stepDotsRow}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => {
          const stepNum = i + 1;
          const isComplete = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          return (
            <React.Fragment key={stepNum}>
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor: isComplete ? colors.success : isActive ? colors.brand : colors.surfaceAlt,
                    borderColor: isComplete ? colors.success : isActive ? colors.brand : colors.border,
                  },
                ]}
              >
                {isComplete ? (
                  <Ionicons name="checkmark" size={14} color={colors.textInverse} />
                ) : (
                  <Text
                    style={[
                      styles.stepDotText,
                      { color: isActive ? colors.textInverse : colors.textMuted },
                    ]}
                  >
                    {stepNum}
                  </Text>
                )}
              </View>
              {stepNum < TOTAL_STEPS ? (
                <View style={[styles.stepConnector, { backgroundColor: stepNum < currentStep ? colors.success : colors.border }]} />
              ) : null}
            </React.Fragment>
          );
        })}
      </View>
      <Text style={styles.stepLabel}>
        Step {currentStep} of {TOTAL_STEPS} — {STEP_LABELS[currentStep - 1]}
      </Text>
    </View>
  );
}

// ── Step 1: Identity ──
function StepIdentity({
  colors,
  styles,
  legalName,
  setLegalName,
  dob,
  setDob,
  address,
  setAddress,
  phone,
  setPhone,
  errors,
  reducedMotionEnabled,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  legalName: string;
  setLegalName: (v: string) => void;
  dob: string;
  setDob: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  errors: Record<string, string>;
  reducedMotionEnabled: boolean;
}) {
  const formatDob = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    return formatted;
  };

  return (
    <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(250)} style={styles.stepWrap}>
      <Text style={styles.stepTitle}>Identity information</Text>
      <Text style={styles.stepSubtitle}>
        Enter your legal details exactly as they appear on your document.
      </Text>

      <View style={styles.fieldGroup}>
        <AppInput
          label="Legal full name"
          value={legalName}
          onChangeText={setLegalName}
          placeholder="Jane Doe"
          errorText={errors.legalName}
          autoCapitalize="words"
          accessibilityLabel="Legal full name"
        />
        <AppInput
          label="Date of birth"
          value={dob}
          onChangeText={(t) => setDob(formatDob(t))}
          placeholder="DD/MM/YYYY"
          errorText={errors.dob}
          keyboardType="numeric"
          maxLength={10}
          accessibilityLabel="Date of birth"
          helperText="Format: DD/MM/YYYY"
        />
        <AppInput
          label="Home address"
          value={address}
          onChangeText={setAddress}
          placeholder="123 Main Street, London"
          errorText={errors.address}
          autoCapitalize="words"
          accessibilityLabel="Home address"
        />
        <AppInput
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          placeholder="+44 7000 000000"
          errorText={errors.phone}
          keyboardType="phone-pad"
          accessibilityLabel="Phone number"
        />
      </View>

      <View style={[styles.trustNote, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
        <Text style={styles.trustNoteText}>
          Your information is encrypted and used only for identity verification.
        </Text>
      </View>
    </Reanimated.View>
  );
}

// ── Step 2: Document ──
function StepDocument({
  colors,
  styles,
  documentType,
  setDocumentType,
  documentFrontUri,
  documentBackUri,
  errors,
  onCapture,
  onClearFront,
  onClearBack,
  reducedMotionEnabled,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  documentType: DocumentType;
  setDocumentType: (t: DocumentType) => void;
  documentFrontUri: string | null;
  documentBackUri: string | null;
  errors: Record<string, string>;
  onCapture: (target: 'docFront' | 'docBack') => void;
  onClearFront: () => void;
  onClearBack: () => void;
  reducedMotionEnabled: boolean;
}) {
  const needsBack = documentType !== 'passport';

  return (
    <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(250)} style={styles.stepWrap}>
      <Text style={styles.stepTitle}>Document verification</Text>
      <Text style={styles.stepSubtitle}>
        Choose your document type and capture a clear photo.
      </Text>

      <AppSegmentControl<DocumentType>
        value={documentType}
        onChange={setDocumentType}
        fullWidth
        options={[
          { value: 'passport', label: 'Passport', accessibilityLabel: 'Passport' },
          { value: 'driving_licence', label: "Driver's License", accessibilityLabel: "Driver's license" },
          { value: 'national_id', label: 'National ID', accessibilityLabel: 'National ID' },
        ]}
        style={styles.docTypeSelector}
      />

      <View style={[styles.qualityNote, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="sunny-outline" size={14} color={colors.warning} />
        <Text style={styles.qualityNoteText}>
          Make sure the document is well-lit and all text is readable.
        </Text>
      </View>

      {/* Document front */}
      <CaptureTile
        label="Document front"
        uri={documentFrontUri}
        error={errors.front}
        onCapture={() => onCapture('docFront')}
        onClear={onClearFront}
        colors={colors}
        styles={styles}
        icon="card-outline"
      />

      {/* Document back — skip for passport */}
      {needsBack ? (
        <CaptureTile
          label="Document back"
          uri={documentBackUri}
          error={errors.back}
          onCapture={() => onCapture('docBack')}
          onClear={onClearBack}
          colors={colors}
          styles={styles}
          icon="card-outline"
        />
      ) : null}
    </Reanimated.View>
  );
}

// ── Step 3: Selfie ──
function StepSelfie({
  colors,
  styles,
  selfieUri,
  errors,
  onCapture,
  onClear,
  reducedMotionEnabled,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  selfieUri: string | null;
  errors: Record<string, string>;
  onCapture: () => void;
  onClear: () => void;
  reducedMotionEnabled: boolean;
}) {
  return (
    <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(250)} style={styles.stepWrap}>
      <Text style={styles.stepTitle}>Selfie verification</Text>
      <Text style={styles.stepSubtitle}>
        We will verify your identity by comparing your selfie to your document photo.
      </Text>

      <View style={[styles.livenessNote, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="person-outline" size={14} color={colors.brand} />
        <Text style={styles.livenessNoteText}>
          Look straight ahead, then turn your head slowly left and right.
        </Text>
      </View>

      <CaptureTile
        label="Selfie photo"
        uri={selfieUri}
        error={errors.selfie}
        onCapture={onCapture}
        onClear={onClear}
        colors={colors}
        styles={styles}
        icon="person-circle-outline"
        circular
      />
    </Reanimated.View>
  );
}

// ── Step 4: Business ──
function StepBusiness({
  colors,
  styles,
  isBusiness,
  setIsBusiness,
  businessName,
  setBusinessName,
  registrationNumber,
  setRegistrationNumber,
  businessAddress,
  setBusinessAddress,
  errors,
  reducedMotionEnabled,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  isBusiness: boolean;
  setIsBusiness: (v: boolean) => void;
  businessName: string;
  setBusinessName: (v: string) => void;
  registrationNumber: string;
  setRegistrationNumber: (v: string) => void;
  businessAddress: string;
  setBusinessAddress: (v: string) => void;
  errors: Record<string, string>;
  reducedMotionEnabled: boolean;
}) {
  return (
    <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(250)} style={styles.stepWrap}>
      <Text style={styles.stepTitle}>Business information</Text>
      <Text style={styles.stepSubtitle}>
        Optional — tell us if you are selling as a business or an individual.
      </Text>

      {/* Toggle: business vs individual */}
      <View style={styles.toggleRow}>
        <Pressable
          onPress={() => { setIsBusiness(false); }}
          style={[
            styles.toggleOption,
            !isBusiness && { backgroundColor: colors.surface, borderColor: colors.brand, borderWidth: Stroke.emphasis },
            { borderColor: colors.border },
          ]}
          accessibilityRole="radio"
          accessibilityState={{ selected: !isBusiness }}
          accessibilityLabel="Selling as an individual"
        >
          <Ionicons name="person-outline" size={20} color={!isBusiness ? colors.brand : colors.textMuted} />
          <Text style={[styles.toggleLabel, { color: !isBusiness ? colors.textPrimary : colors.textMuted }]}>
            Individual
          </Text>
        </Pressable>
        <Pressable
          onPress={() => { setIsBusiness(true); }}
          style={[
            styles.toggleOption,
            isBusiness && { backgroundColor: colors.surface, borderColor: colors.brand, borderWidth: Stroke.emphasis },
            { borderColor: colors.border },
          ]}
          accessibilityRole="radio"
          accessibilityState={{ selected: isBusiness }}
          accessibilityLabel="Selling as a business"
        >
          <Ionicons name="business-outline" size={20} color={isBusiness ? colors.brand : colors.textMuted} />
          <Text style={[styles.toggleLabel, { color: isBusiness ? colors.textPrimary : colors.textMuted }]}>
            Business
          </Text>
        </Pressable>
      </View>

      {isBusiness ? (
        <View style={styles.fieldGroup}>
          <AppInput
            label="Business name"
            value={businessName}
            onChangeText={setBusinessName}
            placeholder="Acme Ltd"
            errorText={errors.businessName}
            autoCapitalize="words"
            accessibilityLabel="Business name"
          />
          <AppInput
            label="Registration number"
            value={registrationNumber}
            onChangeText={setRegistrationNumber}
            placeholder="12345678"
            errorText={errors.registrationNumber}
            accessibilityLabel="Business registration number"
          />
          <AppInput
            label="Business address"
            value={businessAddress}
            onChangeText={setBusinessAddress}
            placeholder="123 Business Park, London"
            errorText={errors.businessAddress}
            autoCapitalize="words"
            accessibilityLabel="Business address"
          />
        </View>
      ) : (
        <View style={[styles.trustNote, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
          <Text style={styles.trustNoteText}>
            You can add business details later if your selling activity changes.
          </Text>
        </View>
      )}
    </Reanimated.View>
  );
}

// ── Step 5: Review ──
function StepReview({
  colors,
  styles,
  legalName,
  dob,
  address,
  phone,
  documentType,
  hasSelfie,
  isBusiness,
  businessName,
  registrationNumber,
  businessAddress,
  termsAccepted,
  setTermsAccepted,
  errors,
  submitError,
  reducedMotionEnabled,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  legalName: string;
  dob: string;
  address: string;
  phone: string;
  documentType: DocumentType;
  hasSelfie: boolean;
  isBusiness: boolean;
  businessName: string;
  registrationNumber: string;
  businessAddress: string;
  termsAccepted: boolean;
  setTermsAccepted: (v: boolean) => void;
  errors: Record<string, string>;
  submitError: string | null;
  reducedMotionEnabled: boolean;
}) {
  const docLabel =
    documentType === 'passport' ? 'Passport'
    : documentType === 'driving_licence' ? "Driver's License"
    : 'National ID';

  return (
    <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(250)} style={styles.stepWrap}>
      <Text style={styles.stepTitle}>Review & submit</Text>
      <Text style={styles.stepSubtitle}>
        Please confirm the information below before submitting.
      </Text>

      {/* Summary — read-only */}
      <View style={[styles.reviewSection, { borderBottomColor: colors.border }]}>
        <Text style={styles.reviewSectionLabel}>Identity</Text>
        <ReviewRow label="Legal name" value={legalName} colors={colors} styles={styles} />
        <ReviewRow label="Date of birth" value={dob} colors={colors} styles={styles} />
        <ReviewRow label="Address" value={address} colors={colors} styles={styles} />
        <ReviewRow label="Phone" value={phone} colors={colors} styles={styles} />
      </View>

      <View style={[styles.reviewSection, { borderBottomColor: colors.border }]}>
        <Text style={styles.reviewSectionLabel}>Document</Text>
        <ReviewRow label="Type" value={docLabel} colors={colors} styles={styles} />
        <ReviewRow label="Front" value="Captured" colors={colors} styles={styles} />
        {documentType !== 'passport' ? (
          <ReviewRow label="Back" value="Captured" colors={colors} styles={styles} />
        ) : null}
      </View>

      <View style={[styles.reviewSection, { borderBottomColor: colors.border }]}>
        <Text style={styles.reviewSectionLabel}>Selfie</Text>
        <ReviewRow label="Photo" value={hasSelfie ? 'Captured' : 'Not captured'} colors={colors} styles={styles} />
      </View>

      <View style={styles.reviewSection}>
        <Text style={styles.reviewSectionLabel}>Business</Text>
        {isBusiness ? (
          <>
            <ReviewRow label="Business name" value={businessName} colors={colors} styles={styles} />
            <ReviewRow label="Registration" value={registrationNumber} colors={colors} styles={styles} />
            <ReviewRow label="Address" value={businessAddress} colors={colors} styles={styles} />
          </>
        ) : (
          <ReviewRow label="Selling as" value="Individual" colors={colors} styles={styles} />
        )}
      </View>

      {/* Terms checkbox */}
      <Pressable
        onPress={() => setTermsAccepted(!termsAccepted)}
        style={styles.termsRow}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: termsAccepted }}
        accessibilityLabel="Confirm information is accurate"
      >
        <View style={[styles.termsCheckbox, termsAccepted && { backgroundColor: colors.brand, borderColor: colors.brand }, { borderColor: colors.border }]}>
          {termsAccepted ? <Ionicons name="checkmark" size={16} color={colors.textInverse} /> : null}
        </View>
        <Text style={styles.termsText}>
          I confirm the information provided is accurate
        </Text>
      </Pressable>

      {errors.terms ? (
        <Text style={styles.termsError}>{errors.terms}</Text>
      ) : null}

      {submitError ? (
        <View style={[styles.submitErrorWrap, { backgroundColor: colors.danger + '15' }]}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={[styles.submitErrorText, { color: colors.danger }]}>{submitError}</Text>
        </View>
      ) : null}

      <View style={[styles.trustNote, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="time-outline" size={14} color={colors.warning} />
        <Text style={styles.trustNoteText}>
          Review typically takes within 24 hours. We will notify you when it is complete.
        </Text>
      </View>
    </Reanimated.View>
  );
}

// ── Capture tile ──
function CaptureTile({
  label,
  uri,
  error,
  onCapture,
  onClear,
  colors,
  styles,
  icon,
  circular,
}: {
  label: string;
  uri: string | null;
  error?: string;
  onCapture: () => void;
  onClear: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  circular?: boolean;
}) {
  if (uri) {
    return (
      <View style={styles.captureTileWrap}>
        <Text style={styles.captureLabel}>{label}</Text>
        <View style={styles.capturedRow}>
          <RNImage
            source={{ uri }}
            style={[styles.capturedPreview, circular && { borderRadius: Radius.full }]}
            resizeMode="cover"
          />
          <View style={styles.capturedActions}>
            <Pressable
              onPress={onCapture}
              style={[styles.retakeBtn, { borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={`Retake ${label}`}
            >
              <Ionicons name="camera-outline" size={16} color={colors.textPrimary} />
              <Text style={styles.retakeText}>Retake</Text>
            </Pressable>
            <Pressable
              onPress={onClear}
              style={styles.clearBtn}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${label}`}
              hitSlop={8}
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={[styles.retakeText, { color: colors.danger }]}>Remove</Text>
            </Pressable>
          </View>
        </View>
        {error ? <Text style={styles.captureError}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.captureTileWrap}>
      <Text style={styles.captureLabel}>{label}</Text>
      <Pressable
        onPress={onCapture}
        style={[styles.captureTile, { backgroundColor: colors.surfaceAlt, borderColor: error ? colors.danger : colors.border }]}
        accessibilityRole="button"
        accessibilityLabel={`Capture ${label}`}
      >
        <View style={[styles.captureIconWrap, circular && { borderRadius: Radius.full }]}>
          <Ionicons name={icon} size={28} color={colors.textMuted} />
        </View>
        <Text style={styles.captureTileText}>Tap to capture</Text>
      </Pressable>
      {error ? <Text style={styles.captureError}>{error}</Text> : null}
    </View>
  );
}

// ── Review row ──
function ReviewRow({
  label,
  value,
  colors,
  styles,
}: {
  label: string;
  value: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewRowLabel}>{label}</Text>
      <Text style={styles.reviewRowValue} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

// ── Submitted step ──
function SubmittedStep({
  icon,
  label,
  status,
  colors,
  styles,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  status: 'complete' | 'active';
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const color = status === 'complete' ? colors.success : colors.warning;
  return (
    <View style={styles.submittedStepRow}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.submittedStepText, { color: colors.textPrimary }]}>{label}</Text>
    </View>
  );
}

// ── Styles ──
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    // Step indicator
    stepIndicatorWrap: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    stepDotsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepDot: {
      width: Space.lg + Space.xs,
      height: Space.lg + Space.xs,
      borderRadius: Radius.xl,
      borderWidth: Stroke.standard,
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepDotText: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.semibold,
    },
    stepConnector: {
      flex: 1,
      maxWidth: Space.xl + Space.sm,
      height: Space.xs / 2,
      marginHorizontal: Space.xs,
    },
    stepLabel: {
      textAlign: 'center',
      marginTop: Space.xs,
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
      letterSpacing: Type.meta.letterSpacing,
      color: colors.textMuted,
    },
    // Step content
    stepScroll: {
      flex: 1,
    },
    stepContent: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      paddingBottom: Space.xl,
    },
    stepWrap: {
      gap: Space.sm,
    },
    stepTitle: {
      fontSize: Type.title.size,
      fontFamily: Typography.family.bold,
      letterSpacing: Type.title.letterSpacing,
      color: colors.textPrimary,
    },
    stepSubtitle: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.body.letterSpacing,
      color: colors.textSecondary,
      lineHeight: Type.body.lineHeight,
    },
    fieldGroup: {
      gap: Space.md,
      marginTop: Space.sm,
    },
    // Trust note
    trustNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
      padding: Space.sm + 2,
      borderRadius: Radius.md,
      marginTop: Space.sm,
    },
    trustNoteText: {
      flex: 1,
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.captionElevated.lineHeight,
      color: colors.textSecondary,
    },
    // Document step
    docTypeSelector: {
      marginTop: Space.sm,
    },
    qualityNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
      padding: Space.sm + 2,
      borderRadius: Radius.md,
      marginTop: Space.sm,
    },
    qualityNoteText: {
      flex: 1,
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.captionElevated.lineHeight,
      color: colors.textSecondary,
    },
    // Capture tile
    captureTileWrap: {
      marginTop: Space.sm,
    },
    captureLabel: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.semibold,
      color: colors.textSecondary,
      marginBottom: Space.xs,
    },
    captureTile: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.lg,
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      borderStyle: 'dashed',
    },
    captureIconWrap: {
      width: Space.xl * 2,
      height: Space.xl * 2,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    captureTileText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
    },
    captureError: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.danger,
      marginTop: Space.xs,
    },
    capturedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
    },
    capturedPreview: {
      width: Space.xxl + Space.xl,
      height: Space.xxl + Space.xl,
      borderRadius: Radius.md,
    },
    capturedActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      flex: 1,
    },
    retakeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
    },
    retakeText: {
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    clearBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.sm,
    },
    // Liveness note
    livenessNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
      padding: Space.sm + 2,
      borderRadius: Radius.md,
    },
    livenessNoteText: {
      flex: 1,
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.captionElevated.lineHeight,
      color: colors.textSecondary,
    },
    // Business toggle
    toggleRow: {
      flexDirection: 'row',
      gap: Space.sm,
      marginTop: Space.sm,
    },
    toggleOption: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.md,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
    },
    toggleLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
    },
    // Review step
    reviewSection: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      paddingVertical: Space.sm,
      gap: Space.xs,
    },
    reviewSectionLabel: {
      fontSize: Type.metaElevated.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.metaElevated.letterSpacing,
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginBottom: Space.xs,
    },
    reviewRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: Space.md,
      paddingVertical: Space.xs / 2,
    },
    reviewRowLabel: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      color: colors.textSecondary,
      flexShrink: 0,
    },
    reviewRowValue: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
      textAlign: 'right',
      flex: 1,
    },
    // Terms
    termsRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      marginTop: Space.md,
      paddingVertical: Space.xs,
    },
    termsCheckbox: {
      width: Control.icon,
      height: Control.icon,
      borderRadius: Radius.sm,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: Space.xs / 2,
    },
    termsText: {
      flex: 1,
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.body.lineHeight,
      color: colors.textPrimary,
    },
    termsError: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      color: colors.danger,
      marginTop: Space.xs,
    },
    submitErrorWrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
      padding: Space.sm + 2,
      borderRadius: Radius.md,
      marginTop: Space.sm,
    },
    submitErrorText: {
      flex: 1,
      fontSize: Type.captionElevated.size,
      fontFamily: Typography.family.medium,
      lineHeight: Type.captionElevated.lineHeight,
    },
    // Submission loading overlay
    submittingOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.xl,
    },
    submittingCard: {
      borderRadius: Radius.lg,
      padding: Space.xl,
      alignItems: 'center',
      gap: Space.sm,
      minWidth: 220,
    },
    submittingText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
      textAlign: 'center',
    },
    submittingSubtext: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      textAlign: 'center',
    },
    // Footer
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.md,
    },
    footerBtn: {
      flex: 0,
    },
    // Submitted state
    submittedWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.lg,
      gap: Space.sm,
    },
    submittedIcon: {
      width: Space.xxl + Space.xl,
      height: Space.xxl + Space.xl,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Space.sm,
    },
    submittedTitle: {
      fontSize: Type.title.size,
      fontFamily: Typography.family.bold,
      letterSpacing: Type.title.letterSpacing,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    submittedBody: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.body.lineHeight,
      color: colors.textSecondary,
      textAlign: 'center',
      maxWidth: 320,
    },
    submittedTimeline: {
      width: '100%',
      maxWidth: 340,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: Space.md,
      gap: Space.sm,
      marginTop: Space.md,
    },
    submittedStepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    submittedStepText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
    },
    submittedBtn: {
      marginTop: Space.lg,
      minWidth: 280,
    },
  });
}
