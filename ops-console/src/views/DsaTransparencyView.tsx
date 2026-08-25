import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type StatementOfReasonsRecord, type DsaTransparencyReport } from '../api.js';

// ── DSA Transparency View ───────────────────────────────────────────────
//
// Statement-of-reasons export and transparency reporting surface.
// The table is the dominant object; the metrics bar is flat text + dots,
// not decorative cards. Decision-type indicators (V/M/P/A) are small text
// labels, not badges. PUIDs render in monospace.
//
// Export produces a DSA-database-ready record set. The report button
// generates a period summary shown inline.

type LoadingState = 'loading' | 'populated' | 'empty' | 'error' | 'denied';

type DotState = 'danger' | 'warning' | 'info' | 'success' | 'none';

function dotColor(s: DotState): string {
  switch (s) {
    case 'danger': return 'var(--state-danger)';
    case 'warning': return 'var(--state-warning)';
    case 'info': return 'var(--state-info)';
    case 'success': return 'var(--state-success)';
    default: return 'var(--text-disabled)';
  }
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DsaTransparencyView() {
  const navigate = useNavigate();
  const [statements, setStatements] = useState<StatementOfReasonsRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<LoadingState>('loading');
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [selected, setSelected] = useState<StatementOfReasonsRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportCount, setExportCount] = useState<number | null>(null);
  const [report, setReport] = useState<DsaTransparencyReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const loadStatements = useCallback(async () => {
    setState('loading');
    try {
      const params: Record<string, string> = { limit: '100' };
      if (from) params.period_start = from;
      if (to) params.period_end = to;
      const result = await api.getStatementsOfReasons(params);
      setStatements(result.statements);
      setTotal(result.total);
      setState(result.statements.length > 0 ? 'populated' : 'empty');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 401) { navigate('/'); return; }
        if (err.statusCode === 403) { setState('denied'); return; }
      }
      setState('error');
    }
  }, [from, to, navigate]);

  useEffect(() => {
    loadStatements();
  }, [loadStatements]);

  // Keep drawer in sync after submission status changes.
  useEffect(() => {
    if (selected) {
      const fresh = statements.find((s) => s.id === selected.id);
      if (fresh && fresh !== selected) setSelected(fresh);
    }
  }, [statements, selected]);

  const metrics = useMemo(() => {
    let submitted = 0;
    let pending = 0;
    let automated = 0;
    for (const s of statements) {
      if (s.submittedToDsaDb) submitted++;
      else pending++;
      if (s.automatedMeans) automated++;
    }
    const automationRate = statements.length > 0 ? Math.round((automated / statements.length) * 100) : 0;
    return { total: statements.length, submitted, pending, automated, automationRate };
  }, [statements]);

  const handleExport = async () => {
    setActionError(null);
    setExporting(true);
    setExportCount(null);
    try {
      const params: Record<string, string> = {};
      if (from) params.period_start = from;
      if (to) params.period_end = to;
      const result = await api.exportDsaStatements(params);
      setExportCount(result.total);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const handleGenerateReport = async () => {
    setActionError(null);
    setReportLoading(true);
    try {
      const result = await api.getDsaTransparencyReport(from, to);
      setReport(result.report);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setReportLoading(false);
    }
  };

  const handleMarkSubmitted = async (statementId: string) => {
    setActionError(null);
    setMarking(true);
    try {
      await api.markDsaSubmitted([statementId]);
      await loadStatements();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="queue-view">
      <div className="queue-header">
        <span className="queue-header__title">
          DSA Transparency
          <span style={{ marginLeft: 'var(--space-2)', color: 'var(--text-tertiary)', fontSize: 'var(--text-metadata)' }}>
            {total} statements
          </span>
        </span>
        <div className="queue-header__filters">
          <input
            type="date"
            className="form-field__input"
            style={{ width: '140px', fontSize: 'var(--text-metadata)' }}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="Period start"
          />
          <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-metadata)' }}>→</span>
          <input
            type="date"
            className="form-field__input"
            style={{ width: '140px', fontSize: 'var(--text-metadata)' }}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Period end"
          />
          <button
            className="btn btn--secondary"
            style={{ padding: '2px 8px', fontSize: '11px' }}
            onClick={handleGenerateReport}
            disabled={reportLoading}
          >
            {reportLoading ? 'Generating…' : 'Generate report'}
          </button>
          <button
            className="btn btn--primary"
            style={{ padding: '2px 8px', fontSize: '11px' }}
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? 'Exporting…' : 'Export for DSA Database'}
          </button>
        </div>
      </div>

      {/* ── Metrics bar — flat text + dots, not cards ───────────────── */}
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
          <MetricItem label={`${metrics.total} total`} dot="none" />
          <MetricItem label={`${metrics.submitted} submitted`} dot="success" />
          <MetricItem label={`${metrics.pending} pending`} dot="warning" />
          <MetricItem label={`${metrics.automationRate}% automation`} dot="info" />
        </div>
      )}

      {/* ── Inline report summary ────────────────────────────────────── */}
      {report && (
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--border-hairline)',
            fontSize: 'var(--text-metadata)',
            color: 'var(--text-secondary)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
          }}
        >
          <span><strong style={{ color: 'var(--text-primary)' }}>{report.totalDecisions}</strong> decisions</span>
          <span><strong style={{ color: 'var(--text-primary)' }}>{report.totalCases}</strong> cases</span>
          <span><strong style={{ color: 'var(--text-primary)' }}>{Math.round(report.automationRate * 100)}%</strong> automated</span>
          <span><strong style={{ color: 'var(--text-primary)' }}>{report.appealRate.toFixed(2)}</strong> appeal rate</span>
          <span><strong style={{ color: 'var(--text-primary)' }}>{report.overturnRate.toFixed(2)}</strong> overturn rate</span>
          <span><strong style={{ color: 'var(--text-primary)' }}>{report.averageTimeToDecision.toFixed(1)}h</strong> avg time</span>
        </div>
      )}

      {exportCount !== null && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-4)',
            borderBottom: '1px solid var(--border-hairline)',
            fontSize: 'var(--text-metadata)',
            color: 'var(--state-success)',
          }}
        >
          Exported {exportCount} records for the DSA database.
        </div>
      )}

      {actionError && (
        <div
          style={{
            padding: 'var(--space-2) var(--space-4)',
            borderBottom: '1px solid var(--border-hairline)',
            fontSize: 'var(--text-metadata)',
            color: 'var(--state-danger)',
          }}
        >
          {actionError}
        </div>
      )}

      {state === 'loading' && (
        <StateMessage title="Loading statements…" description="" />
      )}
      {state === 'empty' && (
        <StateMessage title="No statements" description="No statements of reasons for the selected period." />
      )}
      {state === 'error' && (
        <StateMessage title="Failed to load" description="Could not fetch statements of reasons." />
      )}
      {state === 'denied' && (
        <StateMessage title="Permission denied" description="You do not have permission to view DSA transparency data." />
      )}

      {state === 'populated' && (
        <table className="data-table">
          <thead className="data-table__head">
            <tr>
              <th className="data-table__th">PUID</th>
              <th className="data-table__th">Category</th>
              <th className="data-table__th">Types</th>
              <th className="data-table__th">Automated</th>
              <th className="data-table__th">Source</th>
              <th className="data-table__th">Submitted</th>
              <th className="data-table__th">Created</th>
            </tr>
          </thead>
          <tbody>
            {statements.map((s) => (
              <tr
                key={s.id}
                className={`data-table__row${selected?.id === s.id ? ' data-table__row--selected' : ''}`}
                onClick={() => setSelected(s)}
              >
                <td className="data-table__td data-table__td--metadata" style={{ fontFamily: 'var(--font-mono)' }}>
                  {s.puid}
                </td>
                <td className="data-table__td data-table__td--secondary">{s.dsaCategory}</td>
                <td className="data-table__td">
                  <DecisionTypeIndicators s={s} />
                </td>
                <td className="data-table__td data-table__td--metadata">
                  {s.automatedMeans ? 'Yes' : 'No'}
                </td>
                <td className="data-table__td data-table__td--secondary">{s.source}</td>
                <td className="data-table__td data-table__td--metadata">
                  {s.submittedToDsaDb ? (
                    <span className="status-badge status-badge--success">
                      <span className="status-badge__dot" />
                      {s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : 'Yes'}
                    </span>
                  ) : (
                    <span className="status-badge status-badge--warning">
                      <span className="status-badge__dot" />
                      Pending
                    </span>
                  )}
                </td>
                <td className="data-table__td data-table__td--metadata">
                  {new Date(s.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && (
        <StatementDrawer
          statement={selected}
          onClose={() => setSelected(null)}
          onMarkSubmitted={() => handleMarkSubmitted(selected.id)}
          marking={marking}
        />
      )}
    </div>
  );
}

// ── Statement detail drawer ──────────────────────────────────────────────

function StatementDrawer({
  statement,
  onClose,
  onMarkSubmitted,
  marking,
}: {
  statement: StatementOfReasonsRecord;
  onClose: () => void;
  onMarkSubmitted: () => void;
  marking: boolean;
}) {
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
        <span className="action-rail__title">Statement of Reasons</span>
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
          {statement.puid}
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Decision</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-metadata)' }}>{statement.decisionId}</div>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Affected user</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-metadata)' }}>{statement.affectedUserId}</div>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>DSA category</div>
        <div>{statement.dsaCategory}</div>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Decision types</div>
        <DecisionTypeIndicators s={statement} />
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Territorial scope</div>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-secondary)' }}>
          {statement.territorialScope.length > 0 ? statement.territorialScope.join(', ') : '—'}
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Duration</div>
        <div>{statement.duration}</div>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Automated</div>
        <div>{statement.automatedMeans ? 'Yes' : 'No'}</div>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Source</div>
        <div>{statement.source}</div>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>User notification</div>
        <div>{statement.userNotificationState}</div>
      </div>

      {/* ── Facts — the dominant text block ─────────────────────────── */}
      <div className="action-rail__section">
        <div className="action-rail__title">Facts</div>
        <div
          style={{
            fontSize: 'var(--text-body)',
            color: 'var(--text-primary)',
            lineHeight: 'var(--line-height-normal)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {statement.facts}
        </div>
      </div>

      {/* ── Submission status ───────────────────────────────────────── */}
      <div className="action-rail__section">
        <div className="action-rail__title">DSA Database</div>
        {statement.submittedToDsaDb ? (
          <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-secondary)' }}>
            Submitted{statement.submittedAt ? ` · ${new Date(statement.submittedAt).toLocaleString()}` : ''}
          </div>
        ) : (
          <button
            className="action-button"
            onClick={onMarkSubmitted}
            disabled={marking}
          >
            <span>{marking ? 'Marking…' : 'Mark as submitted'}</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Decision type indicators (V/M/P/A — small text labels, not badges) ───

function DecisionTypeIndicators({ s }: { s: StatementOfReasonsRecord }) {
  const types: { letter: string; active: boolean; label: string }[] = [
    { letter: 'V', active: s.decisionVisibility, label: 'Visibility' },
    { letter: 'M', active: s.decisionMandatory, label: 'Mandatory' },
    { letter: 'P', active: s.decisionProvision, label: 'Provision' },
    { letter: 'A', active: s.decisionAccount, label: 'Account' },
  ];
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--space-1)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-metadata)' }}>
      {types.map((t) => (
        <span
          key={t.letter}
          title={t.label}
          style={{
            color: t.active ? 'var(--text-primary)' : 'var(--text-disabled)',
            fontWeight: t.active ? 'var(--weight-medium)' : 'var(--weight-regular)',
          }}
        >
          {t.letter}
        </span>
      ))}
    </span>
  );
}

// ── Metric item (flat text + dot) ────────────────────────────────────────

function MetricItem({ label, dot }: { label: string; dot: DotState }) {
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
