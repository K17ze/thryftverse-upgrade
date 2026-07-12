import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsInfoBanner } from '../components/settings/SettingsInfoBanner';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { useAppTheme } from '../theme/ThemeContext';
import {
  VERIFICATION_TIERS,
  VerificationTier,
} from '../platform/product/listingDetailContract';

type Props = StackScreenProps<RootStackParamList, 'Verification'>;

type KycStep = 'status' | 'identity' | 'document' | 'review';
type Dac7Step = 'status' | 'details' | 'review';

const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
];

const UK_COUNTRIES = ['GB', 'IE'];

export default function VerificationScreen({ navigation }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const currentUser = useStore((state) => state.currentUser);
  const coOwnCompliance = useStore((state) => state.coOwnCompliance);
  const updateCoOwnCompliance = useStore((state) => state.updateCoOwnCompliance);

  // Verification status — derived from user + compliance state
  const emailVerified = currentUser?.emailVerified ?? false;
  const kycVerified = coOwnCompliance.kycVerified;
  const currentTier: VerificationTier = kycVerified ? 'id' : emailVerified ? 'email' : 'email';

  // KYC flow state
  const [kycStep, setKycStep] = React.useState<KycStep>('status');
  const [kycFullName, setKycFullName] = React.useState('');
  const [kycDob, setKycDob] = React.useState('');
  const [kycAddressLine, setKycAddressLine] = React.useState('');
  const [kycCity, setKycCity] = React.useState('');
  const [kycPostcode, setKycPostcode] = React.useState('');
  const [kycCountry, setKycCountry] = React.useState('GB');
  const [kycDocumentType, setKycDocumentType] = React.useState<'passport' | 'driving_licence' | 'national_id'>('passport');
  const [isSubmittingKyc, setIsSubmittingKyc] = React.useState(false);

  // DAC7 flow state
  const [dac7Step, setDac7Step] = React.useState<Dac7Step>('status');
  const [dac7Tin, setDac7Tin] = React.useState('');
  const [dac7Country, setDac7Country] = React.useState('GB');
  const [dac7IsEuResident, setDac7IsEuResident] = React.useState(false);
  const [dac7SelfDeclared, setDac7SelfDeclared] = React.useState(false);
  const [isSubmittingDac7, setIsSubmittingDac7] = React.useState(false);

  // DAC7 status — stored in compliance profile
  const dac7Completed = (coOwnCompliance as any).dac7Completed ?? false;

  const handleStartKyc = () => {
    if (kycVerified) {
      show('Your identity is already verified', 'info');
      return;
    }
    setKycStep('identity');
  };

  const handleSubmitKyc = async () => {
    if (!kycFullName.trim() || !kycDob.trim() || !kycAddressLine.trim() || !kycCity.trim() || !kycPostcode.trim()) {
      show('Please fill in all fields', 'error');
      return;
    }
    setIsSubmittingKyc(true);
    try {
      // Simulate submission — in production this would call a KYC provider
      await new Promise((resolve) => setTimeout(resolve, 1500));
      updateCoOwnCompliance({ kycVerified: true });
      show('Identity verification submitted. We will review your documents within 24 hours.', 'success');
      setKycStep('status');
    } catch {
      show('Verification submission failed. Please try again.', 'error');
    } finally {
      setIsSubmittingKyc(false);
    }
  };

  const handleSubmitDac7 = async () => {
    if (!dac7Tin.trim()) {
      show('Please enter your tax identification number', 'error');
      return;
    }
    if (!dac7SelfDeclared) {
      show('Please confirm the self-declaration checkbox', 'error');
      return;
    }
    setIsSubmittingDac7(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // Store DAC7 completion in compliance profile
      (updateCoOwnCompliance as any)({ dac7Completed: true, dac7Tin: dac7Tin, dac7Country: dac7Country });
      show('Tax information saved', 'success');
      setDac7Step('status');
    } catch {
      show('Failed to save tax information. Please try again.', 'error');
    } finally {
      setIsSubmittingDac7(false);
    }
  };

  const tierInfo = VERIFICATION_TIERS[currentTier];

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Verification"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── STATUS CARD ── */}
      <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.statusIconWrap, { backgroundColor: `${colors.success}15` }]}>
          <Ionicons
            name={tierInfo.icon as keyof typeof Ionicons.glyphMap}
            size={28}
            color={tierInfo.color === 'brand' ? colors.brand : colors.success}
          />
        </View>
        <View style={styles.statusBody}>
          <Text style={[styles.statusTitle, { color: colors.textPrimary }]}>
            {tierInfo.label}
          </Text>
          <Text style={[styles.statusDescription, { color: colors.textSecondary }]}>
            {tierInfo.description}
          </Text>
        </View>
      </View>

      {/* ── VERIFICATION STEPS ── */}
      <SettingsSection title="Verification steps">
        <SettingsRow
          icon="mail-outline"
          iconColor={colors.success}
          title="Email verified"
          subtitle={emailVerified ? 'Confirmed' : 'Pending — check your inbox'}
          toggleValue={emailVerified}
          onToggle={() => {}}
          isFirst
        />
        <SettingsRow
          icon="card-outline"
          iconColor={kycVerified ? colors.success : colors.textMuted}
          title="Identity verification"
          subtitle={kycVerified ? 'ID verified' : 'Verify your identity with a government document'}
          onPress={handleStartKyc}
          isLast
        />
      </SettingsSection>

      {/* ── KYC FLOW ── */}
      {kycStep !== 'status' ? (
        <View style={[styles.flowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.flowHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.flowTitle, { color: colors.textPrimary }]}>
              {kycStep === 'identity' ? 'Your details' : kycStep === 'document' ? 'Document' : 'Review'}
            </Text>
            <Pressable onPress={() => setKycStep('status')} accessibilityLabel="Cancel verification">
              <Ionicons name="close-outline" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {kycStep === 'identity' ? (
            <View style={styles.flowBody}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Full legal name</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                value={kycFullName}
                onChangeText={setKycFullName}
                placeholder="As shown on your ID"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
              />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Date of birth</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                value={kycDob}
                onChangeText={setKycDob}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Address line</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                value={kycAddressLine}
                onChangeText={setKycAddressLine}
                placeholder="Street address"
                placeholderTextColor={colors.textMuted}
              />
              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>City</Text>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                    value={kycCity}
                    onChangeText={setKycCity}
                    placeholder="City"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Postcode</Text>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                    value={kycPostcode}
                    onChangeText={setKycPostcode}
                    placeholder="Postcode"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                  />
                </View>
              </View>
              <AnimatedPressable
                style={styles.flowPrimaryBtn}
                onPress={() => setKycStep('document')}
                hapticFeedback="medium"
                accessibilityRole="button"
                accessibilityLabel="Continue to document upload"
              >
                <Text style={styles.flowPrimaryBtnText}>Continue</Text>
              </AnimatedPressable>
            </View>
          ) : null}

          {kycStep === 'document' ? (
            <View style={styles.flowBody}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Document type</Text>
              {(['passport', 'driving_licence', 'national_id'] as const).map((doc) => (
                <Pressable
                  key={doc}
                  style={[
                    styles.docOption,
                    {
                      borderColor: kycDocumentType === doc ? colors.brand : colors.border,
                      backgroundColor: kycDocumentType === doc ? `${colors.brand}10` : colors.surfaceAlt,
                    },
                  ]}
                  onPress={() => setKycDocumentType(doc)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: kycDocumentType === doc }}
                  accessibilityLabel={`Select ${doc.replace('_', ' ')}`}
                >
                  <Ionicons
                    name={doc === 'passport' ? 'book-outline' : doc === 'driving_licence' ? 'car-outline' : 'id-card-outline'}
                    size={20}
                    color={kycDocumentType === doc ? colors.brand : colors.textSecondary}
                  />
                  <Text style={[styles.docOptionText, { color: kycDocumentType === doc ? colors.brand : colors.textPrimary }]}>
                    {doc === 'passport' ? 'Passport' : doc === 'driving_licence' ? 'Driving licence' : 'National ID'}
                  </Text>
                  {kycDocumentType === doc ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.brand} />
                  ) : null}
                </Pressable>
              ))}
              <View style={[styles.uploadPlaceholder, { borderColor: colors.border }]}>
                <Ionicons name="cloud-upload-outline" size={32} color={colors.textMuted} />
                <Text style={[styles.uploadText, { color: colors.textMuted }]}>
                  Upload a clear photo of your {kycDocumentType === 'driving_licence' ? 'licence' : kycDocumentType === 'national_id' ? 'ID card' : 'passport'}
                </Text>
                <AnimatedPressable
                  style={[styles.uploadBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                  onPress={() => show('Document upload will be available in the next step', 'info')}
                  hapticFeedback="light"
                >
                  <Text style={[styles.uploadBtnText, { color: colors.textPrimary }]}>Choose file</Text>
                </AnimatedPressable>
              </View>
              <View style={styles.flowNavRow}>
                <AnimatedPressable
                  style={[styles.flowBackBtn, { borderColor: colors.border }]}
                  onPress={() => setKycStep('identity')}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel="Back to identity step"
                >
                  <Text style={[styles.flowBackBtnText, { color: colors.textSecondary }]}>Back</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={[styles.flowPrimaryBtn, { backgroundColor: colors.brand }]}
                  onPress={() => setKycStep('review')}
                  hapticFeedback="medium"
                  accessibilityRole="button"
                  accessibilityLabel="Continue to review"
                >
                  <Text style={[styles.flowPrimaryBtnText, { color: colors.background }]}>Continue</Text>
                </AnimatedPressable>
              </View>
            </View>
          ) : null}

          {kycStep === 'review' ? (
            <View style={styles.flowBody}>
              <View style={[styles.reviewRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.reviewLabel, { color: colors.textMuted }]}>Name</Text>
                <Text style={[styles.reviewValue, { color: colors.textPrimary }]}>{kycFullName}</Text>
              </View>
              <View style={[styles.reviewRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.reviewLabel, { color: colors.textMuted }]}>Date of birth</Text>
                <Text style={[styles.reviewValue, { color: colors.textPrimary }]}>{kycDob}</Text>
              </View>
              <View style={[styles.reviewRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.reviewLabel, { color: colors.textMuted }]}>Address</Text>
                <Text style={[styles.reviewValue, { color: colors.textPrimary }]} numberOfLines={2}>
                  {kycAddressLine}, {kycCity}, {kycPostcode}
                </Text>
              </View>
              <View style={[styles.reviewRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.reviewLabel, { color: colors.textMuted }]}>Document</Text>
                <Text style={[styles.reviewValue, { color: colors.textPrimary }]}>
                  {kycDocumentType === 'passport' ? 'Passport' : kycDocumentType === 'driving_licence' ? 'Driving licence' : 'National ID'}
                </Text>
              </View>
              <SettingsInfoBanner
                icon="lock-closed-outline"
                text="Your data is encrypted and used only for identity verification. It is deleted after review."
              />
              <View style={styles.flowNavRow}>
                <AnimatedPressable
                  style={[styles.flowBackBtn, { borderColor: colors.border }]}
                  onPress={() => setKycStep('document')}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel="Back to document upload"
                >
                  <Text style={[styles.flowBackBtnText, { color: colors.textSecondary }]}>Back</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={[styles.flowPrimaryBtn, { backgroundColor: colors.brand }, isSubmittingKyc && styles.flowPrimaryBtnDisabled]}
                  onPress={handleSubmitKyc}
                  disabled={isSubmittingKyc}
                  hapticFeedback="medium"
                  accessibilityRole="button"
                  accessibilityLabel="Submit verification"
                >
                  {isSubmittingKyc ? (
                    <ActivityIndicator size="small" color={colors.background} />
                  ) : (
                    <Text style={[styles.flowPrimaryBtnText, { color: colors.background }]}>Submit</Text>
                  )}
                </AnimatedPressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── DAC7 TAX INFORMATION ── */}
      <SettingsSection title="Tax information (DAC7)">
        <SettingsRow
          icon="document-text-outline"
          iconColor={dac7Completed ? colors.success : colors.textMuted}
          title="DAC7 tax details"
          subtitle={dac7Completed ? 'Tax information provided' : 'Required for EU sellers under DAC7 regulation'}
          onPress={() => setDac7Step(dac7Step === 'status' ? 'details' : 'status')}
          isFirst
          isLast
        />
      </SettingsSection>

      {dac7Step !== 'status' ? (
        <View style={[styles.flowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.flowHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.flowTitle, { color: colors.textPrimary }]}>
              {dac7Step === 'details' ? 'Tax details' : 'Review'}
            </Text>
            <Pressable onPress={() => setDac7Step('status')} accessibilityLabel="Cancel">
              <Ionicons name="close-outline" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {dac7Step === 'details' ? (
            <View style={styles.flowBody}>
              <SettingsInfoBanner
                icon="information-circle-outline"
                text="Under the EU DAC7 directive, digital platforms must report seller tax information. This data is shared with EU tax authorities."
              />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Tax identification number (TIN)</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                value={dac7Tin}
                onChangeText={setDac7Tin}
                placeholder="Your TIN / National Insurance number"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
              />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Country of tax residence</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.countryScroll}
                contentContainerStyle={styles.countryScrollContent}
              >
                {[...UK_COUNTRIES, ...EU_COUNTRIES].map((code) => (
                  <Pressable
                    key={code}
                    style={[
                      styles.countryChip,
                      {
                        borderColor: dac7Country === code ? colors.brand : colors.border,
                        backgroundColor: dac7Country === code ? `${colors.brand}10` : colors.surfaceAlt,
                      },
                    ]}
                    onPress={() => {
                      setDac7Country(code);
                      setDac7IsEuResident(EU_COUNTRIES.includes(code));
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: dac7Country === code }}
                    accessibilityLabel={`Select ${code}`}
                  >
                    <Text style={[styles.countryChipText, { color: dac7Country === code ? colors.brand : colors.textPrimary }]}>
                      {code}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                style={styles.checkboxRow}
                onPress={() => setDac7SelfDeclared(!dac7SelfDeclared)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: dac7SelfDeclared }}
                accessibilityLabel="Confirm tax information is accurate"
              >
                <Ionicons
                  name={dac7SelfDeclared ? 'checkbox-outline' : 'square-outline'}
                  size={20}
                  color={dac7SelfDeclared ? colors.brand : colors.textMuted}
                />
                <Text style={[styles.checkboxText, { color: colors.textSecondary }]}>
                  I confirm this tax information is accurate and complete
                </Text>
              </Pressable>
              <View style={styles.flowNavRow}>
                <AnimatedPressable
                  style={[styles.flowBackBtn, { borderColor: colors.border }]}
                  onPress={() => setDac7Step('status')}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel="Cancel tax information entry"
                >
                  <Text style={[styles.flowBackBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={[styles.flowPrimaryBtn, { backgroundColor: colors.brand }, isSubmittingDac7 && styles.flowPrimaryBtnDisabled]}
                  onPress={handleSubmitDac7}
                  disabled={isSubmittingDac7}
                  hapticFeedback="medium"
                  accessibilityRole="button"
                  accessibilityLabel="Save tax information"
                >
                  {isSubmittingDac7 ? (
                    <ActivityIndicator size="small" color={colors.background} />
                  ) : (
                    <Text style={[styles.flowPrimaryBtnText, { color: colors.background }]}>Save</Text>
                  )}
                </AnimatedPressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <SettingsInfoBanner
        icon="shield-checkmark-outline"
        text="Verification builds trust with buyers and unlocks higher selling limits. Your data is encrypted and never shared publicly."
      />

      <Text style={[styles.footerNote, { color: colors.textMuted }]}>
        Questions? Read our{' '}
        <Text style={[styles.footerLink, { color: colors.brand }]} onPress={() => Linking.openURL('https://thryftverse.com/verification')}>
          verification guide
        </Text>
        .
      </Text>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Space.md,
  },
  statusIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBody: { flex: 1 },
  statusTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    marginBottom: 2,
  },
  statusDescription: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.body.lineHeight,
  },
  flowCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Space.md,
    overflow: 'hidden',
  },
  flowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flowTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  flowBody: {
    padding: Space.md,
    gap: Space.sm,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    marginBottom: 4,
  },
  input: {
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Space.sm,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  fieldHalf: { flex: 1 },
  docOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  docOptionText: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
  },
  uploadPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  uploadText: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    paddingHorizontal: Space.md,
  },
  uploadBtn: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: Radius.sm,
    borderWidth: 1,
    marginTop: Space.xs,
  },
  uploadBtnText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },
  flowNavRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.sm,
  },
  flowBackBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowBackBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  flowPrimaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowPrimaryBtnDisabled: {
    opacity: 0.6,
  },
  flowPrimaryBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Space.md,
  },
  reviewLabel: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
  },
  reviewValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    flex: 1,
    textAlign: 'right',
  },
  countryScroll: {
    marginVertical: -4,
  },
  countryScrollContent: {
    gap: 6,
    paddingVertical: 4,
  },
  countryChip: {
    paddingHorizontal: Space.sm,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  countryChipText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  checkboxText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.regular,
    lineHeight: 18,
  },
  footerNote: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.lg,
  },
  footerLink: {
    fontFamily: Typography.family.semibold,
  },
});
