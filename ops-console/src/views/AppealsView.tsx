import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type AppealRecord } from '../api.js';

// ── Appeals View ────────────────────────────────────────────────────────
//
// Operator surface for reviewing and deciding appeals (DSA Article 20 /
// UK OSA internal complaints). The queue table is the dominant object;
// the detail drawer shows the appeal grounds in full, with the decision
// form as a secondary action rail.
//
// Deadline urgency: red if past deadline, amber if under 48h remaining.

type LoadingState = 'loading' | 'populated' | 'empty' | 'error' | 'denied';

type DecisionAction = 'uphold' | 'overturn' | 'withdraw';

const APPEAL_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'upheld', label: 'Upheld' },
  { key: 'overturned', label: 'Overturned' },
  { key: 'withdrawn', label: 'Withdrawn' },
];

const STATUS_MAP: Record<AppealRecord['status'], { label: string; cls: string }> = {
  submitted: { label: 'Submitted', cls: 'status-badge--info' },
  under_review: { label: 'Under review', cls: 'status-badge--warning' },
  upheld: { label: 'Upheld', cls: 'status-badge--success' },
  overturned: { label: 'Overturned', cls: 'status-badge--unknown' },
  withdrawn: { label: 'Withdrawn', cls: '' },
};

export function AppealsView() {
  const navigate = useNavigate();
  const [appeals, setAppeals] = useState<AppealRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<LoadingState>('loading');
  const [filter, setFilter] = useState<string>('all');
  const [selected, setSelected] = useState<AppealRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAppeals = useCallback(async () => {
    setState('loading');
    try {
      const params: Record<string, string> = { limit: '100' };
      if (filter !== 'all') params.status = filter;
      const result = await api.getAppeals(params);
      setAppeals(result.appeals);
      setTotal(result.total);
      setState(result.appeals.length > 0 ? 'populated' : 'empty');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 401) { navigate('/'); return; }
        if (err.statusCode === 403) { setState('denied'); return; }
      }
      setState('error');
    }
  }, [filter, navigate]);

  useEffect(() => {
    loadAppeals();
  }, [loadAppeals]);

  // Keep the drawer in sync with the latest fetch (status may have changed).
  useEffect(() => {
    if (selected) {
      const fresh = appeals.find((a) => a.id === selected.id);
      if (fresh && fresh !== selected) setSelected(fresh);
    }
  }, [appeals, selected]);

  const handleDecide = async (action: DecisionAction, outcomeReason: string, remedy: string) => {
    if (!selected) return;
    setActionError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { action, outcomeReason };
      if (remedy) body.remedy = remedy;
      const result = await api.decideAppeal(selected.id, body);
      setSelected(result.appeal);
      await loadAppeals();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="queue-view">
      <div className="queue-header">
        <span className="queue-header__title">
          Appeals
          <span style={{ marginLeft: 'var(--space-2)', color: 'var(--text-tertiary)', fontSize: 'var(--text-metadata)' }}>
            {total} {total === 1 ? 'appeal' : 'appeals'}
          </span>
        </span>
        <div className="queue-header__filters">
          {APPEAL_FILTERS.map((f) => (
            <button
              key={f.key}
              className={`filter-chip${filter === f.key ? ' filter-chip--active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {state === 'loading' && (
        <StateMessage title="Loading appeals…" description="" />
      )}
      {state === 'empty' && (
        <StateMessage title="No appeals" description="No appeals match the current filter." />
      )}
      {state === 'error' && (
        <StateMessage title="Failed to load" description="Could not fetch appeals. Retry or contact system operations." />
      )}
      {state === 'denied' && (
        <StateMessage title="Permission denied" description="You do not have permission to review appeals." />
      )}

      {state === 'populated' && (
        <table className="data-table">
          <thead className="data-table__head">
            <tr>
              <th className="data-table__th">PUID</th>
              <th className="data-table__th">Decision</th>
              <th className="data-table__th">Appellant</th>
              <th className="data-table__th">Status</th>
              <th className="data-table__th">Deadline</th>
              <th className="data-table__th">Filed</th>
              <th className="data-table__th">Decided</th>
            </tr>
          </thead>
          <tbody>
            {appeals.map((a) => (
              <tr
                key={a.id}
                className={`data-table__row${selected?.id === a.id ? ' data-table__row--selected' : ''}`}
                onClick={() => setSelected(a)}
              >
                <td className="data-table__td data-table__td--metadata" style={{ fontFamily: 'var(--font-mono)' }}>
                  {a.id.slice(0, 12)}
                </td>
                <td className="data-table__td data-table__td--secondary" style={{ fontFamily: 'var(--font-mono)' }}>
                  {a.decisionId.slice(0, 12)}
                </td>
                <td className="data-table__td data-table__td--secondary">{a.appellantId.slice(0, 12)}</td>
                <td className="data-table__td">
                  <AppealStatusBadge status={a.status} />
                </td>
                <td className="data-table__td data-table__td--metadata">
                  <DeadlineIndicator deadline={a.deadline} />
                </td>
                <td className="data-table__td data-table__td--metadata">
                  {new Date(a.createdAt).toLocaleDateString()}
                </td>
                <td className="data-table__td data-table__td--metadata">
                  {a.decidedAt ? new Date(a.decidedAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && (
        <AppealDrawer
          appeal={selected}
          onClose={() => setSelected(null)}
          onDecide={handleDecide}
          submitting={submitting}
          actionError={actionError}
        />
      )}
    </div>
  );
}

// ── Appeal detail drawer (right rail) ────────────────────────────────────
//
// The grounds text is the dominant object. The decision form sits below
// as a secondary action section, only enabled for undecided appeals.

function AppealDrawer({
  appeal,
  onClose,
  onDecide,
  submitting,
  actionError,
}: {
  appeal: AppealRecord;
  onClose: () => void;
  onDecide: (action: DecisionAction, outcomeReason: string, remedy: string) => void;
  submitting: boolean;
  actionError: string | null;
}) {
  const [action, setAction] = useState<DecisionAction>('uphold');
  const [outcomeReason, setOutcomeReason] = useState('');
  const [remedy, setRemedy] = useState('');

  const decided = appeal.status === 'upheld' || appeal.status === 'overturned' || appeal.status === 'withdrawn';

  return (
    <div
      style={{
        position: 'fixed',
        right: 0,
        top: 'var(--header-height)',
        bottom: 0,
        width: 'var(--action-rail-width)',
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border-hairline)',
        overflowY: 'auto',
        padding: 'var(--space-3)',
        zIndex: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
        <span className="action-rail__title">Appeal</span>
        <button
          className="btn btn--secondary"
          style={{ padding: '2px 8px', fontSize: '11px' }}
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>PUID</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-metadata)', color: 'var(--text-secondary)' }}>
          {appeal.id}
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Status</div>
        <AppealStatusBadge status={appeal.status} />
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Linked decision</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-metadata)' }}>{appeal.decisionId}</div>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Appellant</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-metadata)' }}>{appeal.appellantId}</div>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Independent reviewer</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-metadata)', color: appeal.independentReviewerId ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
          {appeal.independentReviewerId ?? 'Not assigned'}
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Deadline</div>
        <DeadlineIndicator deadline={appeal.deadline} showDate />
      </div>

      {/* ── Grounds — the dominant object ──────────────────────────── */}
      <div className="action-rail__section">
        <div className="action-rail__title">Grounds</div>
        <div
          style={{
            fontSize: 'var(--text-body)',
            color: 'var(--text-primary)',
            lineHeight: 'var(--line-height-normal)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {appeal.grounds}
        </div>
      </div>

      {appeal.outcomeReason && (
        <div className="action-rail__section">
          <div className="action-rail__title">Outcome reason</div>
          <div style={{ fontSize: 'var(--text-body)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
            {appeal.outcomeReason}
          </div>
        </div>
      )}

      {appeal.remedy && (
        <div className="action-rail__section">
          <div className="action-rail__title">Remedy</div>
          <div style={{ fontSize: 'var(--text-body)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
            {appeal.remedy}
          </div>
        </div>
      )}

      {actionError && (
        <div style={{ color: 'var(--state-danger)', fontSize: 'var(--text-metadata)', marginBottom: 'var(--space-3)' }}>
          {actionError}
        </div>
      )}

      {/* ── Decision form — secondary, only for undecided appeals ──── */}
      {!decided && (
        <div className="action-rail__section">
          <div className="action-rail__title">Decision</div>

          <div style={{ display: 'flex', gap: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
            {(['uphold', 'overturn', 'withdraw'] as DecisionAction[]).map((a) => (
              <button
                key={a}
                className={`filter-chip${action === a ? ' filter-chip--active' : ''}`}
                onClick={() => setAction(a)}
                style={a === 'overturn' ? { borderColor: action === a ? 'var(--state-success)' : undefined } : undefined}
              >
                {a === 'uphold' ? 'Uphold' : a === 'overturn' ? 'Overturn' : 'Withdraw'}
              </button>
            ))}
          </div>

          <div className="form-field" style={{ marginBottom: 'var(--space-3)' }}>
            <label className="form-field__label">Outcome reason</label>
            <textarea
              className="form-field__input"
              rows={3}
              value={outcomeReason}
              onChange={(e) => setOutcomeReason(e.target.value)}
              placeholder="Reason for the decision…"
              style={{ resize: 'vertical', fontFamily: 'var(--font-sans)' }}
            />
          </div>

          <div className="form-field" style={{ marginBottom: 'var(--space-3)' }}>
            <label className="form-field__label">Remedy</label>
            <input
              className="form-field__input"
              value={remedy}
              onChange={(e) => setRemedy(e.target.value)}
              placeholder="e.g. restore content, lift suspension…"
            />
          </div>

          <button
            className="btn btn--primary"
            style={{ width: '100%' }}
            disabled={submitting || !outcomeReason.trim()}
            onClick={() => onDecide(action, outcomeReason.trim(), remedy.trim())}
          >
            {submitting ? 'Submitting…' : `Submit ${action}`}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Appeal status badge (text + dot) ─────────────────────────────────────

function AppealStatusBadge({ status }: { status: AppealRecord['status'] }) {
  const s = STATUS_MAP[status];
  return (
    <span className={`status-badge ${s.cls}`}>
      <span className="status-badge__dot" />
      {s.label}
    </span>
  );
}

// ── Deadline urgency indicator ───────────────────────────────────────────
//
// Red if past deadline, amber if under 48h. Otherwise a plain date.
// When showDate is true, the full date is rendered alongside the badge.

function DeadlineIndicator({ deadline, showDate }: { deadline: string; showDate?: boolean }) {
  const dl = new Date(deadline);
  const now = new Date();
  const hoursLeft = (dl.getTime() - now.getTime()) / 3_600_000;

  if (hoursLeft < 0) {
    return (
      <span className="status-badge status-badge--danger">
        <span className="status-badge__dot" />
        {showDate ? `Overdue · ${dl.toLocaleDateString()}` : 'Overdue'}
      </span>
    );
  }

  if (hoursLeft < 48) {
    return (
      <span className="status-badge status-badge--warning">
        <span className="status-badge__dot" />
        {showDate ? `${hoursLeft.toFixed(0)}h left · ${dl.toLocaleDateString()}` : `${hoursLeft.toFixed(0)}h`}
      </span>
    );
  }

  return <span>{dl.toLocaleDateString()}</span>;
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
