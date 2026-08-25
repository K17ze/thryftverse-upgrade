import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// ── Command Palette (⌘K) ────────────────────────────────────────────────
//
// Linear-inspired keyboard-first navigation. Opens with ⌘K (or Ctrl+K).
// Fuzzy-matches against a static command list. Navigation actions route
// to the relevant view. Action commands trigger in-page actions.

interface Command {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  permissions: string[];
}

export function CommandPalette({ open, onClose, permissions }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = [
    { id: 'nav-my-queue', label: 'Go to My Queue', hint: 'G M', keywords: 'queue my cases', action: () => navigate('/queue/my') },
    { id: 'nav-team-queue', label: 'Go to Team Queue', hint: 'G T', keywords: 'queue team cases', action: () => navigate('/queue/team') },
    ...(permissions.includes('cases.read') ? [{
      id: 'nav-all-cases', label: 'Go to All Cases', hint: 'G A', keywords: 'all cases queue', action: () => navigate('/queue/all'),
    }] : []),
    ...(permissions.includes('payments.refund.propose') || permissions.includes('payouts.approve.low_value') ? [{
      id: 'nav-commands', label: 'Go to Commands', hint: 'G C', keywords: 'commands privileged', action: () => navigate('/commands'),
    }] : []),
    ...(permissions.includes('audit.read') ? [{
      id: 'nav-audit', label: 'Go to Audit Chain', hint: 'G U', keywords: 'audit chain events', action: () => navigate('/audit'),
    }] : []),
    ...(permissions.includes('cases.read') ? [{
      id: 'nav-appeals', label: 'Go to Appeals', hint: 'G P', keywords: 'appeals decisions review', action: () => navigate('/appeals'),
    }] : []),
    ...(permissions.includes('cases.read') ? [{
      id: 'nav-dsa', label: 'Go to DSA Transparency', hint: 'G D', keywords: 'dsa transparency compliance', action: () => navigate('/dsa-transparency'),
    }] : []),
    ...(permissions.includes('cases.read') ? [{
      id: 'nav-ofcom', label: 'Go to Ofcom Risk Assessment', hint: 'G O', keywords: 'ofcom risk assessment compliance', action: () => navigate('/ofcom-risk-assessment'),
    }] : []),
    ...(permissions.includes('cases.create') ? [{
      id: 'action-create-case', label: 'Create New Case', hint: 'C', keywords: 'create new case', action: () => navigate('/queue/my'),
    }] : []),
    ...(permissions.includes('incident.breakglass') ? [{
      id: 'action-breakglass', label: 'Start Break-Glass Session', hint: 'B', keywords: 'breakglass emergency incident', action: () => navigate('/queue/my'),
    }] : []),
  ];

  const filtered = query
    ? commands.filter((cmd) => {
        const q = query.toLowerCase();
        return (
          cmd.label.toLowerCase().includes(q) ||
          (cmd.keywords?.toLowerCase().includes(q) ?? false)
        );
      })
    : commands;

  const executeSelected = useCallback(() => {
    const cmd = filtered[selectedIndex];
    if (cmd) {
      cmd.action();
      onClose();
    }
  }, [filtered, selectedIndex, onClose]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeSelected();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered.length, executeSelected, onClose]);

  if (!open) return null;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette__input"
          type="text"
          placeholder="Search commands…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
        />
        <div className="command-palette__list">
          {filtered.length === 0 && (
            <div className="state-message" style={{ padding: 'var(--space-4)' }}>
              <div className="state-message__title">No commands found</div>
            </div>
          )}
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              className={`command-palette__item${i === selectedIndex ? ' command-palette__item--selected' : ''}`}
              onClick={() => {
                cmd.action();
                onClose();
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="command-palette__item-label">{cmd.label}</span>
              {cmd.hint && <span className="command-palette__item-hint">{cmd.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
