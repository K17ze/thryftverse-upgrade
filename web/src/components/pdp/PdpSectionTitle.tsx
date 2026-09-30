export interface PdpSectionTitleProps {
  /** Anchor id — PDP sections are deep-linkable via aria-labelledby wiring. */
  id?: string;
  children: React.ReactNode;
  className?: string;
}

/** One header grammar for all PDP zones: section-title type, semibold, primary. */
export function PdpSectionTitle({ id, children, className = '' }: PdpSectionTitleProps) {
  return (
    <h2 id={id} className={`text-section-title font-semibold text-text-primary ${className}`.trim()}>
      {children}
    </h2>
  );
}
