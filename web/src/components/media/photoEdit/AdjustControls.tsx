'use client';

import { Button } from '@/components/ui/Button';
import type { ImageEdits } from '@/lib/media/imageEdit';

interface AdjustControlsProps {
  edits: ImageEdits;
  onPatchEdits: (patch: Partial<ImageEdits>, announcement?: string) => void;
  onReset: () => void;
}

export function AdjustControls({
  edits,
  onPatchEdits,
  onReset,
}: AdjustControlsProps) {
  return (
    <div className="mt-4 space-y-4">
      {(
        [
          { id: 'brightness', label: 'Brightness', min: 50, max: 150 },
          { id: 'contrast', label: 'Contrast', min: 50, max: 150 },
          { id: 'saturation', label: 'Saturation', min: 0, max: 200 },
        ] as const
      ).map((s) => (
        <div key={s.id}>
          <div className="flex items-baseline justify-between">
            <label
              htmlFor={`edit-${s.id}`}
              className="text-caption font-medium text-text-secondary"
            >
              {s.label}
            </label>
            <span className="tnum text-caption text-text-muted">
              {edits[s.id]}%
            </span>
          </div>
          <input
            id={`edit-${s.id}`}
            type="range"
            min={s.min}
            max={s.max}
            step={1}
            value={edits[s.id]}
            onChange={(e) =>
              onPatchEdits({ [s.id]: Number(e.target.value) } as Partial<ImageEdits>)
            }
            className="mt-1 w-full accent-text-primary"
          />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          aria-pressed={edits.autoLighting}
          onClick={() =>
            onPatchEdits(
              { autoLighting: !edits.autoLighting },
              edits.autoLighting
                ? 'Auto lighting removed.'
                : 'Auto lighting applied — contrast stretched to the photo’s range.',
            )
          }
        >
          Auto lighting
        </Button>
        <Button
          variant="quiet"
          size="sm"
          onClick={onReset}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
