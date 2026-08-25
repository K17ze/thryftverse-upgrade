import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type OfcomRiskAssessmentRecord, type OfcomChildrenRiskFactor } from '../api.js';

// ── Ofcom Risk Assessment View ──────────────────────────────────────────
//
// Manage Ofcom risk assessments across the 18 priority offences defined
// in the UK Online Safety Act. The offence list is the dominant object —
// a compact vertical list with hairline separators, not a grid of cards.
// Missing offences show in muted text, not red error cards.
//
// Risk level uses dot + text (never colour alone). The summary bar is
// flat text with dots, not decorative stat cards.
//
// Two tabs cover the two statutory obligations:
//  - Illegal Content (Section 9): the 18 priority offences
//  - Children (Section 11): a separate children's risk assessment for
//    services likely to be accessed by children

type LoadingState = 'loading' | 'populated' | 'empty' | 'error' | 'denied';

type RiskLevel = 'low' | 'medium' | 'high';

type Tab = 'illegal_content' | 'children';

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

const CHILDREN_RISK_FACTORS = [
  'content_that_ENCOURAGES_RISK_TAKING_BEHAVIOUR',
  'content_that_PROMOTES_EATING_DISORDERS',
  'content_that_DEPICTS_SEXUAL_MATERIAL',
  'content_that_DEPICTS_VIOLENCE',
  'content_that_PROMOTES_SELF_HARM',
  'content_that_PROMOTES_DRUG_USE',
  'content_that_PROMOTES_ALCOHOL_USE',
  'content_that_CONTAINS_GROOMING_BEHAVIOUR',
] as const;

const AGE_GROUPS = ['0-5', '6-12', '13-17'] as const;

function humaniseFactor(factor: string): string {
  return factor
    .replace(/^content_that_/, '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
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
  const [childrenAssessments, setChildrenAssessments] = useState<OfcomRiskAssessmentRecord[]>([]);
  const [overdue, setOverdue] = useState(false);
  const [state, setState] = useState<LoadingState>('loading');
  const [showForm, setShowForm] = useState(false);
  const [showChildrenForm, setShowChildrenForm] = useState(false);
  const [tab, setTab] = useState<Tab>('illegal_content');

  const loadAssessments = useCallback(async () => {
    setState('loading');
    try {
      const result = await api.getOfcomRiskAssessments();
      setAssessments(result.assessments);
      setChildrenAssessments(result.childrenAssessments ?? []);
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

  // Most recent children's assessment (Section 11).
  const latestChildren = useMemo(() => {
    if (childrenAssessments.length === 0) return undefined;
    return childrenAssessments[0];
  }, [childrenAssessments]);

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

  const handleChildrenCreated = () => {
    setShowChildrenForm(false);
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
          {tab === 'illegal_content' ? (
            <button
              className="btn btn--primary"
              style={{ padding: '2px 8px', fontSize: '11px' }}
              onClick={() => setShowForm((v) => !v)}
            >
              New assessment
            </button>
          ) : (
            <button
              className="btn btn--primary"
              style={{ padding: '2px 8px', fontSize: '11px' }}
              onClick={() => setShowChildrenForm((v) => !v)}
            >
              {latestChildren ? 'New children�s assessment' : 'Create children�s assessment'}
            </button>
          )}
        </div>
      </div>

      {/* ── Tab toggle — flat, hairline, no pills/cards ─────────────── */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-hairline)',
        }}
      >
        {([
          { key: 'illegal_content' as Tab, label: 'Illegal Content', sub: 'Section 9' },
          { key: 'children' as Tab, label: 'Children', sub: 'Section 11' },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setShowForm(false); setShowChildrenForm(false); }}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t.key
                ? '2px solid var(--text-primary)'
                : '2px solid transparent',
              color: tab === t.key ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontSize: 'var(--text-body)',
              fontWeight: tab === t.key ? 'var(--weight-medium)' : 'var(--weight-regular)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 'var(--space-2)',
            }}
          >
            {t.label}
            <span style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)' }}>{t.sub}</span>
          </button>
        ))}
      </div>

      {/* ── Summary bar — flat text + dots, not cards ────────────────── */}
      {state === 'populated' && tab === 'illegal_content' && (
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

      {showForm && tab === 'illegal_content' && (
        <NewAssessmentForm
          existingOffences={Object.keys(byOffence)}
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {showChildrenForm && tab === 'children' && (
        <NewChildrenAssessmentForm
          onCreated={handleChildrenCreated}
          onCancel={() => setShowChildrenForm(false)}
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

      {state === 'populated' && tab === 'illegal_content' && (
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

      {state === 'populated' && tab === 'children' && (
        <ChildrenAssessmentSection
          latest={latestChildren}
          allAssessments={childrenAssessments}
        />
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

// ── Children's assessment section (Section 11) ───────────────────────────

interface ChildrenMitigationMeasures {
  age_groups?: string[];
  risk_factors?: OfcomChildrenRiskFactor[];
}

function ChildrenAssessmentSection({
  latest,
  allAssessments,
}: {
  latest: OfcomRiskAssessmentRecord | undefined;
  allAssessments: OfcomRiskAssessmentRecord[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (!latest) {
    return (
      <div style={{ overflowY: 'auto', flex: 1 }}>
        <StateMessage
          title="No children�s assessment"
          description="A Section 11 children�s risk assessment is required for services likely to be accessed by children. Use �Create children�s assessment� above."
        />
      </div>
    );
  }

  const mitigation = (latest.mitigationMeasures as ChildrenMitigationMeasures) ?? {};
  const ageGroups = mitigation.age_groups ?? [];
  const riskFactors = mitigation.risk_factors ?? [];
  const status = reviewStatus(latest);

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {/* ── Status row — flat metadata, hairline, not a card ──────── */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 120px 140px 120px',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-4)',
          borderBottom: '1px solid var(--border-hairline)',
          fontSize: 'var(--text-body)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          transition: 'background 60ms ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <span>Children�s risk assessment</span>
        <span>
          <span
            className={`status-badge ${RISK_DOT[latest.riskLevel] === 'danger' ? 'status-badge--danger' : RISK_DOT[latest.riskLevel] === 'warning' ? 'status-badge--warning' : 'status-badge--success'}`}
          >
            <span className="status-badge__dot" />
            {RISK_LABEL[latest.riskLevel]}
          </span>
        </span>
        <span style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-secondary)' }}>
          {new Date(latest.assessmentDate).toLocaleDateString()}
        </span>
        <span>
          {status === 'overdue' ? (
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

      {expanded && (
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
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-metadata)' }}>{latest.assessedBy}</span>
          </div>
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginRight: 'var(--space-2)' }}>Next review</span>
            <span style={{ fontSize: 'var(--text-metadata)' }}>
              {latest.nextReviewDate ? new Date(latest.nextReviewDate).toLocaleDateString() : 'Not scheduled'}
            </span>
          </div>
          <div style={{ marginBottom: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginRight: 'var(--space-2)' }}>Age groups</span>
            <span style={{ fontSize: 'var(--text-metadata)' }}>
              {ageGroups.length > 0 ? ageGroups.join(', ') : '—'}
            </span>
          </div>
          <div style={{ marginTop: 'var(--space-2)' }}>
            <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Summary</div>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{latest.assessmentSummary}</div>
          </div>
        </div>
      )}

      {/* ── Risk factors — flat list, hairline rows, dot + text ────── */}
      {riskFactors.length > 0 && (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 100px 100px',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-4)',
              borderBottom: '1px solid var(--border-hairline)',
              fontSize: 'var(--text-metadata)',
              fontWeight: 'var(--weight-medium)',
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            <span>Risk factor</span>
            <span>Likelihood</span>
            <span>Impact</span>
          </div>
          {riskFactors.map((rf, i) => (
            <div
              key={`${rf.factor}-${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 100px',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-4)',
                borderBottom: '1px solid var(--border-hairline)',
                fontSize: 'var(--text-body)',
                color: 'var(--text-primary)',
                alignItems: 'center',
              }}
            >
              <span>{humaniseFactor(rf.factor)}</span>
              <span>
                <span
                  className={`status-badge ${RISK_DOT[rf.likelihood] === 'danger' ? 'status-badge--danger' : RISK_DOT[rf.likelihood] === 'warning' ? 'status-badge--warning' : 'status-badge--success'}`}
                >
                  <span className="status-badge__dot" />
                  {RISK_LABEL[rf.likelihood]}
                </span>
              </span>
              <span>
                <span
                  className={`status-badge ${RISK_DOT[rf.impact] === 'danger' ? 'status-badge--danger' : RISK_DOT[rf.impact] === 'warning' ? 'status-badge--warning' : 'status-badge--success'}`}
                >
                  <span className="status-badge__dot" />
                  {RISK_LABEL[rf.impact]}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── History — prior children�s assessments, flat list ──── */}
      {allAssessments.length > 1 && (
        <div>
          <div
            style={{
              padding: 'var(--space-2) var(--space-4)',
              borderBottom: '1px solid var(--border-hairline)',
              fontSize: 'var(--text-metadata)',
              fontWeight: 'var(--weight-medium)',
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            History
          </div>
          {allAssessments.map((a) => (
            <div
              key={a.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '140px 1fr',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-4)',
                borderBottom: '1px solid var(--border-hairline)',
                fontSize: 'var(--text-metadata)',
                color: 'var(--text-secondary)',
              }}
            >
              <span>{new Date(a.assessmentDate).toLocaleDateString()}</span>
              <span style={{ color: 'var(--text-tertiary)' }}>{a.assessmentSummary.slice(0, 80)}{a.assessmentSummary.length > 80 ? '…' : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── New children's assessment form (inline panel, not a modal) ───────────

function NewChildrenAssessmentForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [factors, setFactors] = useState<OfcomChildrenRiskFactor[]>([]);
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleAgeGroup = (g: string) => {
    setAgeGroups((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  };

  const updateFactor = (idx: number, patch: Partial<OfcomChildrenRiskFactor>) => {
    setFactors((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };

  const addFactor = () => {
    setFactors((prev) => [
      ...prev,
      { factor: CHILDREN_RISK_FACTORS[0], likelihood: 'low', impact: 'low', mitigation: '' },
    ]);
  };

  const removeFactor = (idx: number) => {
    setFactors((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    setError(null);
    if (ageGroups.length === 0) {
      setError('Select at least one age group.');
      return;
    }
    if (factors.length === 0) {
      setError('Add at least one risk factor.');
      return;
    }
    if (factors.some((f) => !f.mitigation.trim())) {
      setError('Every risk factor needs a mitigation measure.');
      return;
    }
    if (!summary.trim()) {
      setError('Overall summary is required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.createOfcomChildrenRiskAssessment({
        ageGroups,
        riskFactors: factors,
        overallSummary: summary.trim(),
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
        <span className="action-rail__title">Children�s assessment · Section 11</span>
        <button
          className="btn btn--secondary"
          style={{ padding: '2px 8px', fontSize: '11px' }}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>

      {/* ── Age groups — filter chips, flat ───────────────────────── */}
      <div className="form-field" style={{ marginBottom: 'var(--space-3)' }}>
        <label className="form-field__label">Age groups</label>
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          {AGE_GROUPS.map((g) => (
            <button
              key={g}
              className={`filter-chip${ageGroups.includes(g) ? ' filter-chip--active' : ''}`}
              onClick={() => toggleAgeGroup(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* ── Risk factors — flat rows, hairline, inline add ────────── */}
      <div className="form-field" style={{ marginBottom: 'var(--space-3)' }}>
        <label className="form-field__label">Risk factors</label>
        {factors.map((f, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 110px 110px auto',
              gap: 'var(--space-2)',
              alignItems: 'start',
              padding: 'var(--space-2) 0',
              borderBottom: '1px solid var(--border-hairline)',
            }}
          >
            <select
              className="form-field__input"
              value={f.factor}
              onChange={(e) => updateFactor(i, { factor: e.target.value })}
            >
              {CHILDREN_RISK_FACTORS.map((rf) => (
                <option key={rf} value={rf}>{humaniseFactor(rf)}</option>
              ))}
            </select>
            <select
              className="form-field__input"
              value={f.likelihood}
              onChange={(e) => updateFactor(i, { likelihood: e.target.value as RiskLevel })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <select
              className="form-field__input"
              value={f.impact}
              onChange={(e) => updateFactor(i, { impact: e.target.value as RiskLevel })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <button
              className="btn btn--secondary"
              style={{ padding: '2px 8px', fontSize: '11px' }}
              onClick={() => removeFactor(i)}
            >
              Remove
            </button>
            <input
              className="form-field__input"
              style={{ gridColumn: '1 / -1', marginTop: 'var(--space-1)' }}
              placeholder="Mitigation measure for this factor…"
              value={f.mitigation}
              onChange={(e) => updateFactor(i, { mitigation: e.target.value })}
            />
          </div>
        ))}
        <button
          className="btn btn--secondary"
          style={{ padding: '2px 8px', fontSize: '11px', marginTop: 'var(--space-2)' }}
          onClick={addFactor}
        >
          Add factor
        </button>
      </div>

      <div className="form-field" style={{ marginBottom: 'var(--space-3)' }}>
        <label className="form-field__label">Overall summary</label>
        <textarea
          className="form-field__input"
          rows={4}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Summary of the children�s risk assessment and overall mitigation strategy…"
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
        {submitting ? 'Submitting…' : 'Submit children�s assessment'}
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
