/**
 * VerificationNote — the fixture-mode honesty line. One quiet bordered row:
 * an icon plus a single sentence. Used wherever the UI could otherwise be
 * mistaken for a real identity check (intro, document upload, review).
 */

import { Icon, type AppIconName } from '@/components/ui/Icon';

interface VerificationNoteProps {
  icon?: AppIconName;
  children: React.ReactNode;
}

export function VerificationNote({ icon = 'info', children }: VerificationNoteProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border px-4 py-3.5">
      <Icon name={icon} size={18} className="mt-0.5 shrink-0 text-text-muted" />
      <p className="text-caption leading-relaxed text-text-secondary">{children}</p>
    </div>
  );
}
