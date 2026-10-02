'use client';

import { Button } from '@/components/ui/Button';
import type { ImageEdits } from '@/lib/media/imageEdit';

export const ASPECT_PRESETS: { id: string; label: string; aspect: number | 'free' | 'original' }[] = [
  { id: 'original', label: 'Original', aspect: 'original' },
  { id: 'free', label: 'Free', aspect: 'free' },
  { id: '1:1', label: '1:1', aspect: 1 },
  { id: '4:5', label: '4:5', aspect: 4 / 5 },
  { id: '3:4', label: '3:4', aspect: 3 / 4 },
];

interface CropRotateControlsProps {
  cropAspect: number | 'free' | 'original';
  edits: ImageEdits;
  onPickAspect: (aspect: number | 'free' | 'original', label: string) => void;
  onRotateBy: (delta: 90 | -90) => void;
  onPatchEdits: (patch: Partial<ImageEdits>, announcement?: string) => void;
}

export function CropRotateControls({
  cropAspect,
  edits,
  onPickAspect,
  onRotateBy,
  onPatchEdits,
}: CropRotateControlsProps) {
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Aspect ratio">
        {ASPECT_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={cropAspect === p.aspect}
            onClick={() => onPickAspect(p.aspect, p.label)}
            className={`pressable h-9 rounded-full px-4 text-body font-medium ${
              cropAspect === p.aspect
                ? 'bg-brand text-text-inverse'
                : 'bg-surface-alt text-text-primary hover:bg-surface-raised'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Rotate and flip">
        <Button variant="outline" size="sm" onClick={() => onRotateBy(-90)}>
          Rotate left
        </Button>
        <Button variant="outline" size="sm" onClick={() => onRotateBy(90)}>
          Rotate right
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={edits.flipH}
          onClick={() =>
            onPatchEdits(
              { flipH: !edits.flipH },
              edits.flipH ? 'Flip removed.' : 'Flipped horizontally.',
            )
          }
        >
          Flip
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={edits.flipV}
          onClick={() =>
            onPatchEdits(
              { flipV: !edits.flipV },
              edits.flipV ? 'Vertical flip removed.' : 'Flipped vertically.',
            )
          }
        >
          Flip vertically
        </Button>
      </div>
    </div>
  );
}
