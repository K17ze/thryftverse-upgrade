import { useState } from 'react';
import { setToken, api, ApiError } from '../api.js';

// ── Login View ──────────────────────────────────────────────────────────
//
// Workforce identity login. In production this would redirect to the
// workforce IdP with WebAuthn/FIDO2 phishing-resistant MFA (NIST SP
// 800-63B-4 AAL2+/AAL3). For development, a workforce JWT can be
// pasted directly.

interface LoginViewProps {
  onLoggedIn: () => void;
}

export function LoginView({ onLoggedIn }: LoginViewProps) {
  const [token, setTokenValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError('Enter a workforce token');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setToken(token.trim());
      await api.getEffectivePermissions();
      onLoggedIn();
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        setError('Invalid workforce token. Consumer tokens are not accepted.');
      } else {
        setError((err as Error).message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-view">
      <div className="login-card">
        <h1 className="login-card__title">Operations Console</h1>
        <p className="login-card__subtitle">
          Workforce identity required. Consumer tokens are not accepted.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-field__label">Workforce token</label>
            <input
              className="form-field__input"
              type="password"
              value={token}
              onChange={(e) => setTokenValue(e.target.value)}
              placeholder="Paste workforce JWT…"
              autoFocus
              disabled={loading}
            />
          </div>

          {error && (
            <div style={{ color: 'var(--state-danger)', fontSize: 'var(--text-metadata)' }}>
              {error}
            </div>
          )}

          <button className="btn btn--primary" type="submit" disabled={loading}>
            {loading ? 'Verifying…' : 'Sign in'}
          </button>
        </form>

        <div style={{ marginTop: 'var(--space-4)', fontSize: 'var(--text-metadata)', color: 'var(--text-tertiary)' }}>
          <p>Production: WebAuthn/FIDO2 phishing-resistant MFA (AAL2+).</p>
          <p>Manual OTP is not phishing-resistant (NIST SP 800-63B-4).</p>
        </div>
      </div>
    </div>
  );
}
