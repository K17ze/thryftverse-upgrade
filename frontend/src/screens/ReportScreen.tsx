import React, { useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import {
  FlagshipHeader,
  FlagshipScreen } from '../components/flagship';
import {
  ReportDetailsSection,
  ReportReasonList,
  ReportSubmitFooter,
  ReportSuccessView,
  ReportUnavailableView,
  createReportScreenStyles } from '../components/report';
import { reportUser } from '../services/profileApi';
import { reportListing, type ListingReportReason } from '../services/listingsApi';
import { reportConversationOnApi } from '../services/chatApi';
import { useAppTheme } from '../theme/ThemeContext';
import { useAppTranslation } from '../i18n/useAppTranslation';
import {
  useReportBlock,
  useReportEvidence,
  useReportForm,
  useReportSubmission } from '../hooks/report';
import {
  attachedEvidenceUris,
  reportTitleKey,
  shouldShowBlockAction,
  shouldShowBlockedNote } from '../utils/reportLogic';

type Props = NativeStackScreenProps<RootStackParamList, 'Report'>;

export default function ReportScreen({ navigation, route }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createReportScreenStyles(colors), [colors]);
  const { type, targetId } = route.params ?? {};
  const { t } = useAppTranslation('report');

  const { isSubmitting, isSubmitted, reportId, submittedAt, submit } =
    useReportSubmission();
  const {
    evidenceItems,
    isUploading,
    pickEvidence,
    takeEvidence,
    removeEvidence,
    markEvidenceSubmitted } = useReportEvidence();
  const { isBlocked, isBlocking, hasBlocked, blockTarget } =
    useReportBlock(targetId);
  const { selectedReason, setSelectedReason, details, setDetails, canSubmit } =
    useReportForm({ targetId, isSubmitting, isUploading });

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !selectedReason || !targetId) return;
    const evidenceUris = attachedEvidenceUris(evidenceItems);
    const evidenceParam = evidenceUris.length ? evidenceUris : undefined;
    const detailsParam = details.trim() || undefined;
    const succeeded = await submit(async () => {
      if (type === 'user') {
        return reportUser(targetId, selectedReason, detailsParam, evidenceParam);
      }
      if (type === 'group') {
        return reportConversationOnApi(
          targetId,
          selectedReason,
          detailsParam,
          undefined,
          undefined,
          evidenceParam,
        );
      }
      return reportListing(
        targetId,
        selectedReason as ListingReportReason,
        detailsParam,
        evidenceParam
      );
    }, { targetId, reason: selectedReason });
    if (succeeded) markEvidenceSubmitted();
  }, [
    canSubmit,
    selectedReason,
    targetId,
    type,
    details,
    evidenceItems,
    submit,
    markEvidenceSubmitted,
  ]);

  if (isSubmitted) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title={t('received.title')}
            onBack={() => navigation.goBack()}
          />
        }
      >
        <ReportSuccessView
          reportId={reportId}
          submittedAt={submittedAt}
          evidenceItems={evidenceItems}
          showBlockButton={shouldShowBlockAction(type, isBlocked, hasBlocked)}
          showBlockedNote={shouldShowBlockedNote(type, isBlocked, hasBlocked)}
          isBlocking={isBlocking}
          onBlock={blockTarget}
          onDone={() => navigation.goBack()}
          styles={styles}
        />
      </FlagshipScreen>
    );
  }

  if (!targetId) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title={t('header.title')}
            onBack={() => navigation.goBack()}
          />
        }
      >
        <ReportUnavailableView
          onGoBack={() => navigation.goBack()}
          styles={styles}
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={t(reportTitleKey(type))}
          subtitle={t('header.subtitle')}
          onBack={() => navigation.goBack()}
        />
      }
      stickyFooter={
        <ReportSubmitFooter
          canSubmit={canSubmit}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          styles={styles}
        />
      }
      footerInsetHeight={96}
    >
      <View style={styles.intro}>
        <Text style={styles.introTitle}>{t('intro.title')}</Text>
        <Text style={styles.introBody}>
          {t('intro.body')}
        </Text>
      </View>

      <ReportReasonList
        selectedReason={selectedReason}
        onSelect={setSelectedReason}
        styles={styles}
      />

      {selectedReason ? (
        <ReportDetailsSection
          details={details}
          onChangeDetails={setDetails}
          evidenceItems={evidenceItems}
          isUploading={isUploading}
          onTakeEvidence={takeEvidence}
          onPickEvidence={pickEvidence}
          onRemoveEvidence={removeEvidence}
          styles={styles}
        />
      ) : null}
    </FlagshipScreen>
  );
}
