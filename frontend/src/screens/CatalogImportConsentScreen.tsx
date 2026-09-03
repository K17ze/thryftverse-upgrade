/**
 * CatalogImportConsentScreen — informed consent + file upload for the
 * seller-package import path.
 *
 * States in plain language what we access and don’t access, using a flat
 * hairline-separated list — no icon-on-every-row decoration. Three attestation
 * checkboxes gate the primary action. The upload flow is presign → PUT →
 * finalize. Nothing goes live until the seller approves it later.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import {
  Space,
  Radius,
  FontFamily,
  Stroke,
  Control,
  DockConstants } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppInput } from '../components/ui/AppInput';
import { useHaptic } from '../hooks/useHaptic';
import {
  presignSellerPackage,
  finalizeSellerPackage,
  createImportBatch,
  CatalogImportError } from '../services/catalogImportApi';
import type { CatalogImportStackParamList } from './CatalogImportStartScreen';
import { ConfirmationSheet } from '../components/ConfirmationSheet';

type Nav = NativeStackNavigationProp<CatalogImportStackParamList, 'CatalogImportConsent'>;
type ConsentRoute = RouteProp<CatalogImportStackParamList, 'CatalogImportConsent'>;

const CONSENT_VERSION = '2025-01';

const ACCESS_ROWS = ['Your active listing details', 'Your listing photos'];
const NO_ACCESS_ROWS = [
  'Your password',
  'Buyer messages or reviews',
  'Payouts or order addresses',
];

const ATTESTATIONS = [
  'I own or have permission to reuse the listing text and media',
  'The imported facts, condition, price, and quantity are accurate',
  'The files contain no buyer or customer personal data',
] as const;

interface SelectedFile {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function CatalogImportConsentScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<ConsentRoute>();
  const { source } = route.params ?? {};
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [file, setFile] = useState<SelectedFile | null>(null);
  const [attestations, setAttestations] = useState<boolean[]>([false, false, false]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const isMountedRef = useRef(true);
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const allAttested = attestations.every(Boolean);
  const canSubmit = file !== null && allAttested && !uploading && !creating;

  const toggleAttestation = useCallback((index: number) => {
    setAttestations((prev) => prev.map((v, i) => (i === index ? !v : v)));
  }, []);

  const handleChooseFile = useCallback(async () => {
    setUploadError(null);
    try {
      const DocumentPicker = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      const selected: SelectedFile = {
        uri: asset.uri,
        name: asset.name ?? 'catalogue.csv',
        size: asset.size ?? 0,
        mimeType: asset.mimeType ?? 'text/csv' };
      setFile(selected);
      haptic.selection();
    } catch {
      if (isMountedRef.current) {
        setUploadError('Couldn’t pick that file. Try again.');
      }
    }
  }, [haptic]);

  const uploadFile = useCallback(async (): Promise<string | null> => {
    if (!file) return null;
    setUploading(true);
    setUploadError(null);
    try {
      const presign = await presignSellerPackage({
        fileName: file.name,
        contentType: file.mimeType,
        sizeBytes: file.size });
      // PUT the raw file to the presigned URL. No auth headers — the URL
      // carries its own signed query params.
      const putResponse = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.mimeType },
        body: { uri: file.uri } as unknown as BodyInit });
      if (!putResponse.ok) {
        throw new Error(`Upload failed (${putResponse.status})`);
      }
      await finalizeSellerPackage(presign.packageId, {
        objectKey: presign.objectKey,
        fileName: file.name,
        contentType: file.mimeType,
        sizeBytes: file.size });
      return presign.packageId;
    } catch (cause) {
      const message =
        cause instanceof CatalogImportError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : 'Upload failed. Try again.';
      if (isMountedRef.current) setUploadError(message);
      return null;
    } finally {
      if (isMountedRef.current) setUploading(false);
    }
  }, [file]);

  const handleCreate = useCallback(async () => {
    if (!canSubmit) return;
    setCreating(true);
    try {
      const packageId = await uploadFile();
      if (!packageId) {
        setCreating(false);
        return;
      }
      const batch = await createImportBatch({
        source,
        packageId,
        consentVersion: CONSENT_VERSION });
      haptic.medium();
      navigation.replace('CatalogImportProgress', { batchId: batch.id });
    } catch (cause) {
      const message =
        cause instanceof CatalogImportError ? cause.message : 'Couldn’t create the import.';
      if (isMountedRef.current) setUploadError(message);
    } finally {
      if (isMountedRef.current) setCreating(false);
    }
  }, [canSubmit, uploadFile, source, haptic, navigation]);

  const handleBack = useCallback(() => {
    if (uploading || creating) {
      setConfirmSheet({
        visible: true,
        title: 'Discard this import?',
        message: 'Your file selection and attestations will be cleared.',
        confirmLabel: 'Discard',
        variant: 'danger',
        onConfirm: () => navigation.goBack() });
      return;
    }
    navigation.goBack();
  }, [uploading, creating, navigation, setConfirmSheet]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <AnimatedPressable
          onPress={handleBack}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backHit}
        >
          <Ionicons name="chevron-back" size={Control.icon} color={colors.textPrimary} />
        </AnimatedPressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + DockConstants.singleActionHeight + Space.lg },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Send your catalogue</Text>
        <Text style={styles.intro}>
          We’ll prepare private drafts from your catalogue. Nothing goes live until you approve it.
        </Text>

        {/* ── What we access — flat hairline list ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>What we access</Text>
          {ACCESS_ROWS.map((row, i) => (
            <View
              key={row}
              style={[
                styles.listRow,
                i < ACCESS_ROWS.length - 1 && styles.listRowBorder,
              ]}
            >
              <Text style={styles.listRowText}>{row}</Text>
            </View>
          ))}
        </View>

        {/* ── What we don’t access ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>What we don’t access</Text>
          {NO_ACCESS_ROWS.map((row, i) => (
            <View
              key={row}
              style={[
                styles.listRow,
                i < NO_ACCESS_ROWS.length - 1 && styles.listRowBorder,
              ]}
            >
              <Text style={[styles.listRowText, styles.listRowTextMuted]}>{row}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.controlLine}>
          Disconnect or delete the import at any time.
        </Text>

        {/* ── File upload ── */}
        <View style={styles.uploadSection}>
          <AppInput
            label="File"
            value={file?.name ?? ''}
            placeholder="No file selected"
            editable={false}
            helperText={file ? formatBytes(file.size) : 'CSV or export from your platform'}
            appearance="outline"
            containerStyle={styles.fileInput}
          />
          <AnimatedPressable
            style={styles.chooseFileButton}
            onPress={handleChooseFile}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Choose file"
            disabled={uploading || creating}
          >
            <Text style={styles.chooseFileText}>Choose file</Text>
          </AnimatedPressable>
        </View>

        {/* ── Attestations ── */}
        <View style={styles.attestSection}>
          {ATTESTATIONS.map((label, i) => (
            <AttestationRow
              key={label}
              label={label}
              checked={attestations[i]}
              onToggle={() => toggleAttestation(i)}
              colors={colors}
            />
          ))}
        </View>

        {uploadError && (
          <Text style={styles.errorText} accessibilityRole="alert">
            {uploadError}
          </Text>
        )}
      </ScrollView>

      {/* ── Bottom dock ── */}
      <View
        style={[
          styles.dock,
          {
            paddingBottom: insets.bottom + Space.sm,
            backgroundColor: colors.background,
            borderTopColor: colors.borderSubtle },
        ]}
      >
        <AnimatedPressable
          style={[styles.dockButton, !canSubmit && styles.dockButtonDisabled]}
          onPress={handleCreate}
          disabled={!canSubmit}
          hapticFeedback="medium"
          accessibilityRole="button"
          accessibilityLabel="Create import"
          accessibilityState={{ disabled: !canSubmit }}
        >
          {uploading || creating ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text style={styles.dockButtonText}>Create import</Text>
          )}
        </AnimatedPressable>
      </View>

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={confirmSheet.onConfirm}
      />
    </View>
  );
}

// ── Attestation checkbox row — simple, 44pt hit, 22pt glyph ──────────────────
function AttestationRow({
  label,
  checked,
  onToggle,
  colors }: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createAttestStyles(colors), [colors]);
  return (
    <AnimatedPressable
      style={styles.row}
      onPress={onToggle}
      hapticFeedback="selection"
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <View
        style={[
          styles.checkbox,
          checked && styles.checkboxChecked,
        ]}
      >
        {checked && (
          <Ionicons name="checkmark" size={Control.icon} color={colors.textInverse} />
        )}
      </View>
      <Text style={styles.label}>{label}</Text>
    </AnimatedPressable>
  );
}

const createAttestStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.smMd,
      minHeight: Control.hit,
      paddingVertical: Space.sm },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: Radius.sm,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center' },
    checkboxChecked: {
      backgroundColor: colors.brand,
      borderColor: colors.brand },
    label: {
      flex: 1,
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textPrimary } });

// ── Styles ───────────────────────────────────────────────────────────────────
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1 },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.xs,
      minHeight: Control.hit },
    backHit: {
      width: Control.hit,
      height: Control.hit,
      alignItems: 'center',
      justifyContent: 'center' },
    scrollContent: {
      paddingHorizontal: Space.md,
      flexGrow: 1 },
    title: {
      fontFamily: FontFamily.bold,
      fontSize: TypographyV2.screenTitle.size,
      lineHeight: TypographyV2.screenTitle.lineHeight,
      letterSpacing: TypographyV2.screenTitle.letterSpacing,
      color: colors.textPrimary,
      marginTop: Space.sm },
    intro: {
      marginTop: Space.sm,
      marginBottom: Space.lg,
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textSecondary },
    section: {
      marginBottom: Space.lg },
    sectionLabel: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      color: colors.textPrimary,
      marginBottom: Space.xs },
    listRow: {
      paddingVertical: Space.smMd },
    listRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle },
    listRowText: {
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textPrimary },
    listRowTextMuted: {
      color: colors.textMuted },
    controlLine: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textPrimary,
      marginBottom: Space.xl },
    uploadSection: {
      marginBottom: Space.xl },
    fileInput: {
      marginBottom: Space.sm },
    chooseFileButton: {
      alignSelf: 'flex-start',
      paddingVertical: Space.smMd,
      paddingHorizontal: Space.lg,
      borderRadius: Radius.sm,
      borderWidth: Stroke.standard,
      borderColor: colors.border },
    chooseFileText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      color: colors.textPrimary },
    attestSection: {
      marginBottom: Space.lg },
    errorText: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      color: colors.danger,
      marginTop: Space.sm },
    dock: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: Space.sm,
      paddingHorizontal: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth },
    dockButton: {
      height: DockConstants.primaryButtonHeight,
      borderRadius: Radius.sm,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center' },
    dockButtonDisabled: {
      opacity: 0.4 },
    dockButtonText: {
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      color: colors.textInverse } });
