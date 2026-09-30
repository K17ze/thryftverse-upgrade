export interface SoldOverlayProps {
  /** 'md' for catalogue-scale tiles, 'sm' for compact grid cells. */
  size?: 'md' | 'sm';
}

/**
 * Sold status on media — scrim + centered caps label. One implementation
 * shared by listing tiles, closet cells, moodboard items, and galleria
 * assets so the state reads identically on every surface.
 */
export function SoldOverlay({ size = 'md' }: SoldOverlayProps) {
  return (
    <>
      <div className="absolute inset-0 bg-overlay" />
      <span
        className={`absolute inset-0 flex items-center justify-center uppercase tracking-[1.2px] text-scrim-text-primary ${
          size === 'sm' ? 'text-meta font-bold' : 'text-body font-medium'
        }`}
      >
        Sold
      </span>
    </>
  );
}
