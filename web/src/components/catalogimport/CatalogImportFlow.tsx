'use client';

/**
 * CatalogImportFlow — staged wizard mirroring the mobile import model:
 * Start → Consent → Review → Progress → Summary → Drafts. One flat state
 * machine owned here; the steps are presentational screens. The commit
 * happens on review-confirm so the summary reads a real outcome — the
 * progress step narrates the pipeline with deterministic ticks.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconButton } from '@/components/ui/IconButton';
import { useSession } from '@/lib/session/SessionProvider';
import { CURRENT_USER } from '@/lib/data/fixtures';
import {
  MAX_IMPORT_ROWS,
  draftFromRow,
  hasErrors,
  rowLabel,
  skipReasonFor,
  type ImportBatch,
  type ImportOutcome,
  type ImportRow,
  type SkippedRow,
} from './core';
import { useImportDraftActions, useImportDrafts } from './useImportDrafts';
import { StartStep } from './StartStep';
import { ConsentStep } from './ConsentStep';
import { ReviewStep } from './ReviewStep';
import { ProgressStep } from './ProgressStep';
import { SummaryStep } from './SummaryStep';
import { DraftsView } from './DraftsView';

type Step = 'start' | 'consent' | 'review' | 'progress' | 'summary' | 'drafts';

export function CatalogImportFlow() {
  const router = useRouter();
  const { user } = useSession();
  const seller = user ?? CURRENT_USER;
  const { data: drafts } = useImportDrafts();
  const { appendDrafts } = useImportDraftActions();

  const [step, setStep] = useState<Step>('start');
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  const restart = useCallback(() => {
    setBatch(null);
    setRows([]);
    setOutcome(null);
    setStep('start');
  }, []);

  const handleSourceReady = useCallback((next: ImportBatch, parsed: ImportRow[]) => {
    setBatch(next);
    setRows(parsed);
    setOutcome(null);
    setStep('consent');
  }, []);

  /** Review-confirm — valid included rows become session drafts; every
   *  other row lands on the receipt with its reason. */
  const handleConfirm = useCallback(() => {
    const importable = rows.filter((r) => !r.excluded && !hasErrors(r));
    const skipped: SkippedRow[] = rows
      .filter((r) => r.excluded || hasErrors(r))
      .map((r) => ({ label: rowLabel(r), reason: skipReasonFor(r) }));
    if (batch?.truncated) {
      skipped.push({
        label: `${batch.truncated} more row${batch.truncated === 1 ? '' : 's'}`,
        reason: `Over the ${MAX_IMPORT_ROWS}-row limit`,
      });
    }
    const created = importable.map((r, i) => draftFromRow(r, seller, i));
    if (created.length > 0) appendDrafts(created);
    setOutcome({
      source: batch?.source ?? 'csv',
      fileName: batch?.fileName ?? null,
      importedCount: created.length,
      skipped,
    });
    setStep('progress');
  }, [rows, batch, seller, appendDrafts]);

  const handleProgressDone = useCallback(() => setStep('summary'), []);

  // Back — steps don't push history; the chevron walks the state machine.
  let onBack: (() => void) | undefined;
  if (step === 'start') onBack = () => router.back();
  else if (step === 'consent') onBack = () => setStep('start');
  else if (step === 'review') onBack = () => setStep('consent');
  else if (step === 'summary') onBack = () => router.push('/seller-hub');
  else if (step === 'drafts') onBack = () => setStep(outcome ? 'summary' : 'start');
  // Progress gets no back affordance — the sequence is seconds and commits
  // already happened; interrupting it would lie about the outcome.

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 sm:px-6">
      <div className="flex items-center pb-2 pt-2">
        {onBack ? (
          <IconButton name="back" aria-label="Back" onClick={onBack} className="-ml-3" />
        ) : (
          <span aria-hidden className="-ml-3 h-11 w-11" />
        )}
      </div>

      {step === 'start' ? (
        <StartStep
          draftsCount={drafts?.length ?? 0}
          onSourceReady={handleSourceReady}
          onViewDrafts={() => setStep('drafts')}
        />
      ) : null}
      {step === 'consent' ? (
        <ConsentStep
          source={batch?.source ?? 'csv'}
          fileName={batch?.fileName ?? null}
          onContinue={() => setStep('review')}
        />
      ) : null}
      {step === 'review' ? (
        <ReviewStep rows={rows} onRowsChange={setRows} onConfirm={handleConfirm} />
      ) : null}
      {step === 'progress' ? (
        <ProgressStep source={batch?.source ?? 'csv'} onDone={handleProgressDone} />
      ) : null}
      {step === 'summary' && outcome ? (
        <SummaryStep
          outcome={outcome}
          onReviewDrafts={() => setStep('drafts')}
          onRestart={restart}
        />
      ) : null}
      {step === 'drafts' ? <DraftsView onRestart={restart} /> : null}
    </div>
  );
}
