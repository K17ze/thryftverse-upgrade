import React, { useCallback, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { api, clearToken, getToken, type EffectivePermissions } from './api.js';
import { LoginView } from './views/LoginView.js';
import { WorkQueueView } from './views/WorkQueueView.js';
import { CaseWorkspaceView } from './views/CaseWorkspaceView.js';
import { CommandsView } from './views/CommandsView.js';
import { AuditView } from './views/AuditView.js';
import { AppealsView } from './views/AppealsView.js';
import { DsaTransparencyView } from './views/DsaTransparencyView.js';
import { OfcomRiskAssessmentView } from './views/OfcomRiskAssessmentView.js';
import { CommandPalette } from './components/CommandPalette.js';

// ── Auth context ────────────────────────────────────────────────────────

interface AuthState {
  permissions: EffectivePermissions | null;
  loading: boolean;
  error: string | null;
}

function useAuth(): AuthState & { refresh: () => Promise<void>; logout: () => void } {
  const [state, setState] = useState<AuthState>({
    permissions: null,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setState({ permissions: null, loading: false, error: null });
      return;
    }

    try {
      const perms = await api.getEffectivePermissions();
      setState({ permissions: perms, loading: false, error: null });
    } catch (err) {
      clearToken();
      setState({
        permissions: null,
        loading: false,
        error: (err as Error).message,
      });
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setState({ permissions: null, loading: false, error: null });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh, logout };
}

// ── App shell ───────────────────────────────────────────────────────────

export function App() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl+K to open command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (auth.loading) {
    return (
      <div className="state-message">
        <div className="state-message__title">Loading…</div>
      </div>
    );
  }

  if (!auth.permissions) {
    return <LoginView onLoggedIn={auth.refresh} />;
  }

  const perms = auth.permissions;
  const hasPermission = (action: string) => perms.permissions.includes(action);

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-header__title">ThryftVerse Operations</span>
        <div className="app-header__user">
          <span>{perms.principal.displayName}</span>
          <span>·</span>
          <span>{perms.principal.team}</span>
          <span>·</span>
          <span>AAL{perms.session.authAssurance}</span>
          {perms.session.stepUpAt && (
            <>
              <span>·</span>
              <span>Step-up active</span>
            </>
          )}
          <button
            className="btn btn--secondary"
            style={{ padding: '2px 8px', fontSize: '11px' }}
            onClick={() => {
              auth.logout();
              navigate('/');
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <nav className="app-sidebar">
        <div className="app-sidebar__nav">
          <NavItem to="/queue/my" label="My Queue" icon="queue" active={location.pathname.startsWith('/queue')} />
          <NavItem to="/queue/team" label="Team Queue" icon="team" active={false} />
          {hasPermission('cases.read') && (
            <NavItem to="/queue/all" label="All Cases" icon="all" active={false} />
          )}
          {hasPermission('payments.refund.propose') || hasPermission('payouts.approve.low_value') ? (
            <NavItem to="/commands" label="Commands" icon="command" active={location.pathname === '/commands'} />
          ) : null}
          {hasPermission('audit.read') && (
            <NavItem to="/audit" label="Audit Chain" icon="audit" active={location.pathname === '/audit'} />
          )}
          {hasPermission('cases.read') && (
            <NavItem to="/appeals" label="Appeals" icon="appeal" active={location.pathname === '/appeals'} />
          )}
          {hasPermission('cases.read') && (
            <NavItem to="/dsa-transparency" label="DSA Transparency" icon="dsa" active={location.pathname === '/dsa-transparency'} />
          )}
          {hasPermission('cases.read') && (
            <NavItem to="/ofcom-risk-assessment" label="Ofcom Risk" icon="ofcom" active={location.pathname === '/ofcom-risk-assessment'} />
          )}
        </div>
      </nav>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/queue/my" replace />} />
          <Route path="/queue/:queueId" element={<WorkQueueView />} />
          <Route path="/cases/:caseId" element={<CaseWorkspaceView />} />
          <Route path="/commands" element={<CommandsView />} />
          <Route path="/audit" element={<AuditView />} />
          <Route path="/appeals" element={<AppealsView />} />
          <Route path="/dsa-transparency" element={<DsaTransparencyView />} />
          <Route path="/ofcom-risk-assessment" element={<OfcomRiskAssessmentView />} />
          <Route path="*" element={<Navigate to="/queue/my" replace />} />
        </Routes>
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        permissions={perms.permissions}
      />
    </div>
  );
}

// ── Navigation item (transparent hit area, 20px icon) ───────────────────

function NavItem({
  to,
  label,
  icon,
  active,
}: {
  to: string;
  label: string;
  icon: string;
  active: boolean;
}) {
  return (
    <Link to={to} className={`nav-item${active ? ' nav-item--active' : ''}`}>
      <NavIcon name={icon} />
      <span className="nav-item__label">{label}</span>
    </Link>
  );
}

// ── Icon set (one family, 20px nav glyphs, 16px metadata) ───────────────
// Simple inline SVGs — no decorative chrome, transparent backgrounds.

function NavIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactElement> = {
    queue: (
      <svg className="nav-item__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="16" height="3" rx="1" />
        <rect x="2" y="8.5" width="16" height="3" rx="1" />
        <rect x="2" y="14" width="16" height="3" rx="1" />
      </svg>
    ),
    team: (
      <svg className="nav-item__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="7" cy="7" r="2.5" />
        <circle cx="13" cy="7" r="2.5" />
        <path d="M2 17c0-2.5 2-4 5-4s5 1.5 5 4" />
        <path d="M10 17c0-2.5 2-4 5-4s3 1 3 2" />
      </svg>
    ),
    all: (
      <svg className="nav-item__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="10" r="7" />
        <path d="M10 6v4l3 2" />
      </svg>
    ),
    command: (
      <svg className="nav-item__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M7 4v12M13 4v12M4 7h12M4 13h12" />
      </svg>
    ),
    audit: (
      <svg className="nav-item__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 4h9l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" />
        <path d="M7 10h6M7 13h4" />
      </svg>
    ),
    appeal: (
      <svg className="nav-item__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M10 3l2 5 5 .5-3.5 3.5 1 5L10 14.5 5.5 17l1-5L3 8.5l5-.5z" />
      </svg>
    ),
    dsa: (
      <svg className="nav-item__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 4h12v12H4z" />
        <path d="M7 8h6M7 11h6M7 14h3" />
      </svg>
    ),
    ofcom: (
      <svg className="nav-item__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M10 2L3 6v8l7 4 7-4V6z" />
        <path d="M10 2v16M3 6l7 4 7-4" />
      </svg>
    ),
  };

  return icons[name] ?? icons.queue;
}
