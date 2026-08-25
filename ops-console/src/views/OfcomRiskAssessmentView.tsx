import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type OfcomRiskAssessmentRecord } from '../api.js';

// ── Ofcom Risk Assessment View ──────────────────────────────────────────
//
// Manage Ofcom risk assessments across the 18 priority offences defined
// in the UK Online Safety Act. The offence list is the dominant object —
// a compact vertical list with hairline separators, not a grid of cards.
// Missing offences show in muted text, not red error cards.
//
// Risk level uses dot + text (never colour alone). The summary bar is
// flat text with dots, not decorative stat cards.

type LoadingState = 'loading' | 'populated' | 'empty' | 'error' | 'denied';

type RiskLevel = 'low' | 'medium' | 'high';

type DotState = 'danger' | 'warning' | 'success' | 'none';

function dotColor(s: DotState): string {
  switch (s) {
    case 'danger': return 'var(--state-danger)';
    case 'warning': return 'var(--state-warning)';
    case 'success': return 'var(--state-success)';
    default: return 'var(--text-disabled)';
  }
}

const OFCOM_18_OFFENCES = [
  'terrorism',
  'extreme_sexual_violence',
  'rape_and_serious_sexual_offences',
  'child_sexual_abuse',
  'child_sexual_exploitation',
  'online_grooming',
  'sexual_exploitation_of_children',
  'encouraging_or_assisting_suicide',
  'suicide_and_self_harm',
  'cyberflashing',
  'extreme_pornography',
  'revenge_porn',
  'hate_crime',
  'harassment',
  'fraud',
  'controlled_drugs',
  'weapons_offences',
  'people_smuggling',
];

const RISK_DOT: Record<RiskLevel, DotState> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
};

const RISK_LABEL: Record<RiskLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

function humanise(offence: string): string {
  return offence
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

type ReviewStatus = 'current' | 'overdue' | 'missing';

function reviewStatus(a: OfcomRiskAssessmentRecord | undefined): ReviewStatus {
  if (!a) return 'missing';
  if (!a.nextReviewDate) return 'current';
  return new Date(a.nextReviewDate).getTime() < Date.now() ? 'overdue' : 'current';
}

export function OfcomRiskAssessmentView() {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<OfcomRiskAssessmentRecord[]>([]);
  const [overdue, setOverdue] = useState(false);
  const [state, setState] = useState<LoadingState>('loading');
  const [showForm, setShowForm] = useState(false);

  const loadAssessments = useCallback(async () => {
    setState('loading');
    try {
      const result = await api.getOfcomRiskAssessments();
      setAssessments(result.assessments);
      setOverdue(result.overdue);
      setState('populated');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 401) { navigate('/'); return; }
        if (err.statusCode === 403) { setState('denied'); return; }
      }
      setState('error');
    }
  }, [navigate]);

  useEffect(() => {
    loadAssessments();
  }, [loadAssessments]);

  // Index assessments by offence type for O(1) row lookup.
  const byOffence = useMemo(() => {
    const map: Record<string, OfcomRiskAssessmentRecord> = {};
    for (const a of assessments) {
      // Keep the most recent assessment per offence.
      if (!map[a.offenceType] || new Date(a.assessmentDate) > new Date(map[a.offenceType].assessmentDate)) {
        map[a.offenceType] = a;
      }
    }
    return map;
  }, [assessments]);

  const assessedCount = Object.keys(byOffence).length;
  const missingCount = OFCOM_18_OFFENCES.filter((o) => !byOffence[o]).length;
  // Recompute overdue from current data so the summary stays accurate after
  // a new assessment is created without waiting for a fresh fetch.
  const overdueCount = Object.values(byOffence).filter(
    (a) => a.nextReviewDate && new Date(a.nextReviewDate).getTime() < Date.now(),
  ).length;

  const overallStatus: { label: string; cls: string } = overdue || overdueCount > 0
    ? { label: 'Overdue', cls: 'status-badge--danger' }
    : missingCount > 0
      ? { label: 'Incomplete', cls: 'status-badge--warning' }
      : { label: 'Complete', cls: 'status-badge--success' };

  const handleCreated = () => {
    setShowForm(false);
    loadAssessments();
  };

  return (
    <div className="queue-view">
      <div className="queue-header">
        <span className="queue-header__title">
          Ofcom Risk Assessment
          <span
            className={`status-badge ${overallStatus.cls}`}
            style={{ marginLeft: 'var(--space-3)' }}
          >
            <span className="status-badge__dot" />
            {overallStatus.label}
          </span>
        </span>
        <div className="queue-header__filters">
          <button
            className="btn btn--primary"
            style={{ padding: '2px 8px', fontSize: '11px' }}
            onClick={() => setShowForm((v) => !v)}
          >
            New assessment
          </button>
        </div>
      </div>

      {/* ── Summary bar — flat text + dots, not cards ────────────────── */}
      {state === 'populated' && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-4)',
            alignItems: 'center',
            padding: 'var(--space-2) var(--space-4)',
            borderBottom: '1px solid var(--border-hairline)',
            fontSize: 'var(--text-metadata)',
            color: 'var(--text-tertiary)',
          }}
        >
          <SummaryItem label={`${assessedCount} assessed`} dot="success" />
          <SummaryItem label={`${missingCount} missing`} dot={missingCount > 0 ? 'warning' : 'none'} />
          <SummaryItem label={`${overdueCount} overdue`} dot={overdueCount > 0 ? 'danger' : 'none'} />
          <span style={{ color: 'var(--text-tertiary)' }}>· {OFCOM_18_OFFENCES.length} priority offences</span>
        </div>
      )}

      {showForm && (
        <NewAssessmentForm
          existingOffences={Object.keys(byOffence)}
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {state === 'loading' && (
        <StateMessage title="Loading risk assessments…" description="" />
      )}
      {state === 'error' && (
        <StateMessage title="Failed to load" description="Could not fetch Ofcom risk assessments." />
      )}
      {state === 'denied' && (
        <StateMessage title="Permission denied" description="You do not have permission to view Ofcom risk assessments." />
      )}

      {state === 'populated' && (
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* ── Column header row (compact, monospace metadata) ──────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 120px 140px 120px',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-4)',
              borderBottom: '1px solid var(--border-hairline)',
              fontSize: 'var(--text-metadata)',
              fontWeight: 'var(--weight-medium)',
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              position: 'sticky',
              top: 0,
              background: 'var(--bg-surface)',
              zIndex: 1,
            }}
          >
            <span>Offence</span>
            <span>Risk</span>
            <span>Last assessed</span>
            <span>Review</span>
          </div>

          {OFCOM_18_OFFENCES.map((offence) => {
            const a = byOffence[offence];
            const status = reviewStatus(a);
            return (
              <OffenceRow
                key={offence}
                offence={offence}
                assessment={a}
                status={status}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Offence row (flat, hairline separator, not a card) ───────────────────

function OffenceRow({
  offence,
  assessment,
  status,
}: {
  offence: string;
  assessment: OfcomRiskAssessmentRecord | undefined;
  status: ReviewStatus;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div
        onClick={() => assessment && setExpanded((v) => !v)}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 120px 140px 120px',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-4)',
          borderBottom: '1px solid var(--border-hairline)',
          fontSize: 'var(--text-body)',
          color: 'var(--text-primary)',
          cursor: assessment ? 'pointer' : 'default',
          transition: 'background 60ms ease',
        }}
        onMouseEnter={(e) => {
          if (assessment) e.currentTarget.style.background = 'var(--bg-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <span>{humanise(offence)}</span>
        <span>
          {assessment ? (
            <span
              className={`status-badge ${RISK_DOT[assessment.riskLevel] === 'danger' ? 'status-badge--danger' : RISK_DOT[assessment.riskLevel] === 'warning' ? 'status-badge--warning' : 'status-badge--success'}`}
            >
              <span className="status-badge__dot" />
              {RISK_LABEL[assessment.riskLevel]}
            </span>
          ) : (
            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-metadata)' }}>Not assessed</span>
          )}
        </span>
        <span style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-secondary)' }}>
          {assessment ? new Date(assessment.assessmentDate).toLocaleDateString() : '—'}
        </span>
        <span>
          {status === 'missing' ? (
            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-metadata)' }}>Missing</span>
          ) : status === 'overdue' ? (
            <span className="status-badge status-badge--danger">
              <span className="status-badge__dot" />
              Overdue
            </span>
          ) : (
            <span className="status-badge status-badge--success">
              <span className="status-badge__dot" />
              Current
            </span>
          )}
        </span>
      </div>

      {expanded && assessment && (
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--border-hairline)',
            background: 'var(--bg-surface)',
            fontSize: 'var(--text-body)',
            color: 'var(--text-secondary)',
            lineHeight: 'var(--line-height-normal)',
          }}
        >
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginRight: 'var(--space-2)' }}>Assessed by</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-metadata)' }}>{assessment.assessedBy}</span>
          </div>
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginRight: 'var(--space-2)' }}>Next review</span>
            <span style={{ fontSize: 'var(--text-metadata)' }}>
              {assessment.nextReviewDate ? new Date(assessment.nextReviewDate).toLocaleDateString() : 'Not scheduled'}
            </span>
          </div>
          <div style={{ marginTop: 'var(--space-2)' }}>
            <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Summary</div>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{assessment.assessmentSummary}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── New assessment form (inline panel, not a modal) ──────────────────────

function NewAssessmentForm({
  existingOffences,
  onCreated,
  onCancel,
}: {
  existingOffences: string[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [offenceType, setOffenceType] = useState<string>('');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('low');
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prioritise missing offences, then already-assessed (for re-assessment).
  const offenceOptions = useMemo(() => {
    const missingOffences = OFCOM_18_OFFENCES.filter((o) => !existingOffences.includes(o));
    const assessedOffences = OFCOM_18_OFFENCES.filter((o) => existingOffences.includes(o));
    return { missingOffences, assessedOffences };
  }, [existingOffences]);

  const handleSubmit = async () => {
    setError(null);
    if (!offenceType) {
      setError('Select an offence type.');
      return;
    }
    if (!summary.trim()) {
      setError('Assessment summary is required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.createOfcomRiskAssessment({
        offenceType,
        riskLevel,
        assessmentSummary: summary.trim(),
      });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        padding: 'var(--space-3) var(--space-4)',
        borderBottom: '1px solid var(--border-hairline)',
        background: 'var(--bg-surface)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
        <span className="action-rail__title">New assessment</span>
        <button
          className="btn btn--secondary"
          style={{ padding: '2px 8px', fontSize: '11px' }}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <div className="form-field">
          <label className="form-field__label">Offence type</label>
          <select
            className="form-field__input"
            value={offenceType}
            onChange={(e) => setOffenceType(e.target.value)}
          >
            <option value="">Select…</option>
            {offenceOptions.missingOffences.length > 0 && (
              <optgroup label="Not yet assessed">
                {offenceOptions.missingOffences.map((o) => (
                  <option key={o} value={o}>{humanise(o)}</option>
                ))}
              </optgroup>
            )}
            {offenceOptions.assessedOffences.length > 0 && (
              <optgroup label="Re-assess">
                {offenceOptions.assessedOffences.map((o) => (
                  <option key={o} value={o}>{humanise(o)}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className="form-field">
          <label className="form-field__label">Risk level</label>
          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
            {(['low', 'medium', 'high'] as RiskLevel[]).map((r) => (
              <button
                key={r}
                className={`filter-chip${riskLevel === r ? ' filter-chip--active' : ''}`}
                onClick={() => setRiskLevel(r)}
              >
                {RISK_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="form-field" style={{ marginBottom: 'var(--space-3)' }}>
        <label className="form-field__label">Assessment summary</label>
        <textarea
          className="form-field__input"
          rows={4}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Summary of risk assessment and mitigation measures…"
          style={{ resize: 'vertical', fontFamily: 'var(--font-sans)' }}
        />
      </div>

      {error && (
        <div style={{ color: 'var(--state-danger)', fontSize: 'var(--text-metadata)', marginBottom: 'var(--space-3)' }}>
          {error}
        </div>
      )}

      <button
        className="btn btn--primary"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? 'Submitting…' : 'Submit assessment'}
      </button>
    </div>
  );
}

// ── Summary item (flat text + dot) ───────────────────────────────────────

function SummaryItem({ label, dot }: { label: string; dot: DotState }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
      <span
        style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor(dot), flexShrink: 0 }}
      />
      {label}
    </span>
  );
}

// ── State message ────────────────────────────────────────────────────────

function StateMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="state-message">
      <div className="state-message__title">{title}</div>
      {description && <div className="state-message__description">{description}</div>}
    </div>
  );
}
