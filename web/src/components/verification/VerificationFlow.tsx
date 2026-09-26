'use client';

/**
 * VerificationFlow — orchestrator for the staged KYC flow.
 * Intro → Identity → Document → Review → Status, porting the mobile step
 * machine (KycFlowCard + VerificationStatusScreen) to a single web route.
 *
 * Fixture mode is honest throughout: the review is simulated, the document
 * never leaves the tab, and the persisted store only remembers the outcome
 * and the entered details — so /settings and /profile read the same status.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { Icon } from '@/components/ui/Icon';
import {
  documentFileError,
  identityErrors,
  type IdentityErrorMap,
  type KycDocumentType,
  type KycIdentityFields,
  type VerificationStatus,
  type VerificationStep,
} from './verificationModel';
import { useVerificationStore } from './useVerificationStore';
import { VerificationProgress } from './VerificationProgress';
import { IntroStep } from './IntroStep';
import { IdentityStep } from './IdentityStep';
import { DocumentStep, type KycDocumentFile } from './DocumentStep';
import { ReviewStep } from './ReviewStep';
import { StatusView } from './StatusView';

const EMPTY_FIELDS: KycIdentityFields = {
  fullName: '',
  dob: '',
  addressLine: '',
  city: '',
  postcode: '',
};

const STEP_TITLES: Partial<Record<VerificationStep, string>> = {
  identity: 'Your details',
  document: 'Document',
  review: 'Review',
};

/** Quiet shell while the persisted store hydrates — no state flashes. */
function VerificationSkeleton() {
  return (
    <div aria-hidden>
      <div className="skeleton h-6 w-2/3 rounded-md" />
      <div className="mt-7 space-y-3">
        <div className="skeleton h-16 w-full rounded-lg" />
        <div className="skeleton h-16 w-full rounded-lg" />
        <div className="skeleton h-16 w-full rounded-lg" />
      </div>
      <div className="skeleton mt-8 h-[52px] w-full rounded-md" />
    </div>
  );
}

export function VerificationFlow() {
  const router = useRouter();
  const { user, isGuest } = useSession();
  const hydrated = useHydrated();

  const storeStatus = useVerificationStore((s) => s.status);
  const submittedAt = useVerificationStore((s) => s.submittedAt);
  const rejectionReason = useVerificationStore((s) => s.rejectionReason);
  const record = useVerificationStore((s) => s.record);
  const submitVerification = useVerificationStore((s) => s.submitVerification);
  const completeReview = useVerificationStore((s) => s.completeReview);
  const declineReview = useVerificationStore((s) => s.declineReview);
  const resetVerification = useVerificationStore((s) => s.resetVerification);

  // ── Flow state ──
  const [step, setStep] = useState<VerificationStep>('intro');
  /** Lets an already-verified account run the flow as a demo. */
  const [forceFlow, setForceFlow] = useState(false);
  const [fields, setFields] = useState<KycIdentityFields>(EMPTY_FIELDS);
  const [errors, setErrors] = useState<IdentityErrorMap>({});
  const [documentType, setDocumentType] = useState<KycDocumentType>('passport');
  const [docFile, setDocFile] = useState<KycDocumentFile | null>(null);
  const [docError, setDocError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  // Object URLs are preview-only — revoke on replace/remove/unmount.
  const docUrlRef = useRef<string | null>(null);
  docUrlRef.current = docFile?.url ?? null;
  useEffect(
    () => () => {
      if (docUrlRef.current) URL.revokeObjectURL(docUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (isGuest) router.replace('/auth');
  }, [isGuest, router]);

  const goTo = useCallback((next: VerificationStep) => {
    setStep(next);
    window.scrollTo({ top: 0 });
  }, []);

  /** Prefill the form from the last submission — retry and demo re-runs. */
  const prefillFromRecord = useCallback(() => {
    if (!record) return;
    setFields({
      fullName: record.fullName,
      dob: record.dob,
      addressLine: record.addressLine,
      city: record.city,
      postcode: record.postcode,
    });
    setDocumentType(record.documentType);
  }, [record]);

  // ── Effective status: the store wins once a submission exists; otherwise
  //    the account's existing verification is the honest current state. ──
  const accountVerified = Boolean(user?.identityVerified);
  const effectiveStatus: VerificationStatus =
    storeStatus !== 'not_started' ? storeStatus : accountVerified ? 'approved' : 'not_started';
  const showStatus = !forceFlow && effectiveStatus !== 'not_started';
  // "Verified outside this flow" — no local submission produced the badge.
  const alreadyVerified = accountVerified && record == null;

  const updateFields = (patch: Partial<KycIdentityFields>) => {
    setFields((f) => ({ ...f, ...patch }));
    const key = Object.keys(patch)[0] as keyof KycIdentityFields;
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const continueFromIdentity = () => {
    const next = identityErrors(fields);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    goTo('document');
  };

  const pickDocument = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const error = documentFileError(file);
    if (error) {
      setDocError(error);
      return;
    }
    if (docUrlRef.current) URL.revokeObjectURL(docUrlRef.current);
    setDocFile({ name: file.name, url: URL.createObjectURL(file) });
    setDocError(undefined);
  };

  const removeDocument = () => {
    if (docUrlRef.current) URL.revokeObjectURL(docUrlRef.current);
    setDocFile(null);
  };

  const continueFromDocument = () => {
    if (!docFile) {
      setDocError('Add a photo of your document to continue');
      return;
    }
    setDocError(undefined);
    goTo('review');
  };

  const submit = () => {
    if (!docFile || submitting) return;
    setSubmitting(true);
    // Fixture submit — brief commit state, then the simulated review begins.
    window.setTimeout(() => {
      submitVerification({
        fullName: fields.fullName.trim(),
        dob: fields.dob,
        addressLine: fields.addressLine.trim(),
        city: fields.city.trim(),
        postcode: fields.postcode.trim(),
        documentType,
        documentName: docFile.name,
      });
      setSubmitting(false);
      setForceFlow(false);
      window.scrollTo({ top: 0 });
    }, 700);
  };

  const retry = () => {
    prefillFromRecord();
    setErrors({});
    setDocError(undefined);
    resetVerification();
    setForceFlow(true);
    goTo('identity');
  };

  const runAgain = () => {
    prefillFromRecord();
    setErrors({});
    setDocError(undefined);
    removeDocument();
    resetVerification();
    setForceFlow(true);
    goTo('intro');
  };

  if (isGuest || !user) return null;

  return (
    <>
      <header className="pb-2 pt-8">
        <h1 className="text-screen-title font-bold text-text-primary">Identity verification</h1>
      </header>

      {!hydrated ? (
        <VerificationSkeleton />
      ) : showStatus ? (
        <StatusView
          status={effectiveStatus}
          submittedAt={submittedAt}
          rejectionReason={rejectionReason}
          alreadyVerified={alreadyVerified}
          onCompleteReview={completeReview}
          onDecline={declineReview}
          onRetry={retry}
          onRunAgain={runAgain}
        />
      ) : step === 'intro' ? (
        <IntroStep onStart={() => goTo('identity')} onDismiss={() => router.push('/settings')} />
      ) : (
        <>
          <div className="flex items-center gap-2 pb-5 pt-2 text-caption text-text-muted">
            <Icon name="shieldCheck" size={15} />
            {STEP_TITLES[step]}
          </div>
          <VerificationProgress current={step} onSelect={goTo} />

          {step === 'identity' ? (
            <IdentityStep
              fields={fields}
              errors={errors}
              onChange={updateFields}
              onBack={() => goTo('intro')}
              onContinue={continueFromIdentity}
            />
          ) : null}

          {step === 'document' ? (
            <DocumentStep
              documentType={documentType}
              onSelectType={setDocumentType}
              file={docFile}
              error={docError}
              onPick={pickDocument}
              onRemove={removeDocument}
              onBack={() => goTo('identity')}
              onContinue={continueFromDocument}
            />
          ) : null}

          {step === 'review' ? (
            <ReviewStep
              fields={fields}
              documentType={documentType}
              file={docFile}
              submitting={submitting}
              onEdit={goTo}
              onBack={() => goTo('document')}
              onSubmit={submit}
            />
          ) : null}
        </>
      )}
    </>
  );
}
