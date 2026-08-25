import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type CommandRecord } from '../api.js';

// ── Commands View ───────────────────────────────────────────────────────
//
// Lists privileged commands across all states. Shows command type,
// resource, state, risk tier, amount, and proposer. Clicking a command
// shows the full detail with approval/cancel actions.
//
// Unknown outcomes get a persistent "Check result" action.
// Success appears only when command status is terminal.

type LoadingState = 'loading' | 'populated' | 'empty' | 'error';

export function CommandsView() {
  const navigate = useNavigate();
  const [commands, setCommands] = useState<CommandRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<LoadingState>('loading');
  const [filter, setFilter] = useState<string>('all');
  const [selected, setSelected] = useState<CommandRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadCommands = useCallback(async () => {
    setState('loading');
    try {
      const params: Record<string, string> = { limit: '100' };
      if (filter !== 'all') params.state = filter;
      const result = await api.listCommands(params);
      setCommands(result.commands);
      setTotal(result.total);
      setState(result.commands.length > 0 ? 'populated' : 'empty');
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        navigate('/');
        return;
      }
      setState('error');
    }
  }, [filter, navigate]);

  useEffect(() => {
    loadCommands();
  }, [loadCommands]);

  const handleApprove = async (cmd: CommandRecord, decision: 'approve' | 'reject') => {
    setActionError(null);
    try {
      await api.approveCommand(cmd.id, decision, `${decision} by operator`);
      loadCommands();
      setSelected(null);
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleCancel = async (cmd: CommandRecord) => {
    setActionError(null);
    try {
      await api.cancelCommand(cmd.id, 'Cancelled by operator');
      loadCommands();
      setSelected(null);
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'awaiting_approval', label: 'Awaiting approval' },
    { key: 'approved', label: 'Approved' },
    { key: 'executing', label: 'Executing' },
    { key: 'unknown_outcome', label: 'Unknown' },
    { key: 'succeeded', label: 'Succeeded' },
    { key: 'failed', label: 'Failed' },
  ];

  return (
    <div className="queue-view">
      <div className="queue-header">
        <span className="queue-header__title">
          Commands
          <span style={{ marginLeft: 'var(--space-2)', color: 'var(--text-tertiary)', fontSize: 'var(--text-metadata)' }}>
            {total} total
          </span>
        </span>
        <div className="queue-header__filters">
          {filters.map((f) => (
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
        <StateMessage title="Loading commands…" description="" />
      )}
      {state === 'empty' && (
        <StateMessage title="No commands" description="No commands match the current filter." />
      )}
      {state === 'error' && (
        <StateMessage title="Failed to load" description="Could not fetch commands. Retry or contact system operations." />
      )}

      {state === 'populated' && (
        <table className="data-table">
          <thead className="data-table__head">
            <tr>
              <th className="data-table__th">Type</th>
              <th className="data-table__th">Resource</th>
              <th className="data-table__th">State</th>
              <th className="data-table__th">Risk</th>
              <th className="data-table__th">Amount</th>
              <th className="data-table__th">Proposed</th>
            </tr>
          </thead>
          <tbody>
            {commands.map((cmd) => (
              <tr
                key={cmd.id}
                className={`data-table__row${selected?.id === cmd.id ? ' data-table__row--selected' : ''}`}
                onClick={() => setSelected(cmd)}
              >
                <td className="data-table__td">{cmd.commandType}</td>
                <td className="data-table__td data-table__td--secondary">
                  {cmd.resourceType}:{cmd.resourceId.length > 20 ? cmd.resourceId.slice(0, 20) + '…' : cmd.resourceId}
                </td>
                <td className="data-table__td">
                  <CommandStateBadge state={cmd.state} />
                </td>
                <td className="data-table__td data-table__td--metadata">{cmd.riskTier}</td>
                <td className="data-table__td data-table__td--metadata">
                  {cmd.amountGbp ? `£${cmd.amountGbp.toFixed(2)}` : '—'}
                </td>
                <td className="data-table__td data-table__td--metadata">
                  {new Date(cmd.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Command detail drawer ──────────────────────────────────── */}
      {selected && (
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
            <span className="action-rail__title">Command Detail</span>
            <button
              className="btn btn--secondary"
              style={{ padding: '2px 8px', fontSize: '11px' }}
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>

          <div style={{ marginBottom: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>ID</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-metadata)', color: 'var(--text-secondary)' }}>
              {selected.id}
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Type</div>
            <div>{selected.commandType}</div>
          </div>

          <div style={{ marginBottom: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Resource</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-metadata)' }}>
              {selected.resourceType}:{selected.resourceId}
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>State</div>
            <CommandStateBadge state={selected.state} />
          </div>

          {selected.amountGbp && (
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Amount</div>
              <div>£{selected.amountGbp.toFixed(2)} {selected.currency}</div>
            </div>
          )}

          <div style={{ marginBottom: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Reason</div>
            <div>{selected.reasonCode}</div>
          </div>

          {selected.caseId && (
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <div style={{ fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>Linked case</div>
              <button
                className="btn btn--secondary"
                style={{ padding: '2px 8px', fontSize: '11px' }}
                onClick={() => navigate(`/cases/${selected.caseId}`)}
              >
                {selected.caseId}
              </button>
            </div>
          )}

          {selected.state === 'unknown_outcome' && (
            <div className="command-preview" style={{ marginBottom: 'var(--space-3)' }}>
              <div className="command-preview__label">Unknown outcome</div>
              <div className="command-preview__effect">
                The provider result is unknown. Do not treat as success.
              </div>
              <div className="command-preview__detail">
                Use "Check result" to query the provider for the final state.
              </div>
            </div>
          )}

          {actionError && (
            <div style={{ color: 'var(--state-danger)', fontSize: 'var(--text-metadata)', marginBottom: 'var(--space-3)' }}>
              {actionError}
            </div>
          )}

          {/* Actions */}
          {selected.state === 'awaiting_approval' && (
            <div className="action-rail__section">
              <div className="action-rail__title">Approval</div>
              <button
                className="action-button"
                onClick={() => handleApprove(selected, 'approve')}
              >
                <span>Approve</span>
                <span className="action-button__policy">Separation of duty enforced</span>
              </button>
              <button
                className="action-button action-button--danger"
                onClick={() => handleApprove(selected, 'reject')}
              >
                <span>Reject</span>
              </button>
            </div>
          )}

          {['draft', 'proposed', 'awaiting_approval', 'approved', 'queued'].includes(selected.state) && (
            <div className="action-rail__section">
              <div className="action-rail__title">Cancel</div>
              <button
                className="action-button action-button--danger"
                onClick={() => handleCancel(selected)}
              >
                <span>Cancel command</span>
              </button>
            </div>
          )}

          {selected.state === 'unknown_outcome' && (
            <div className="action-rail__section">
              <div className="action-rail__title">Recovery</div>
              <button
                className="action-button"
                onClick={() => {
                  // Refresh command status
                  api.getCommand(selected.id).then((result) => {
                    setSelected(result.command);
                    loadCommands();
                  });
                }}
              >
                <span>Check result</span>
                <span className="action-button__policy">Query provider</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CommandStateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: 'Draft', cls: '' },
    proposed: { label: 'Proposed', cls: 'status-badge--info' },
    awaiting_approval: { label: 'Awaiting approval', cls: 'status-badge--warning' },
    approved: { label: 'Approved', cls: 'status-badge--info' },
    queued: { label: 'Queued', cls: '' },
    executing: { label: 'Executing', cls: 'status-badge--info' },
    succeeded: { label: 'Succeeded', cls: 'status-badge--success' },
    failed: { label: 'Failed', cls: 'status-badge--danger' },
    unknown_outcome: { label: 'Unknown', cls: 'status-badge--unknown' },
    investigating: { label: 'Investigating', cls: 'status-badge--warning' },
    compensated: { label: 'Compensated', cls: 'status-badge--info' },
    cancelled: { label: 'Cancelled', cls: '' },
    rejected: { label: 'Rejected', cls: 'status-badge--danger' },
    expired: { label: 'Expired', cls: '' },
    superseded: { label: 'Superseded', cls: '' },
  };
  const s = map[state] ?? { label: state, cls: '' };
  return (
    <span className={`status-badge ${s.cls}`}>
      <span className="status-badge__dot" />
      {s.label}
    </span>
  );
}

function StateMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="state-message">
      <div className="state-message__title">{title}</div>
      {description && <div className="state-message__description">{description}</div>}
    </div>
  );
}
