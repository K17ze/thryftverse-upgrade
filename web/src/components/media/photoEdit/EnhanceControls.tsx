'use client';

import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { DATA_MODE } from '@/lib/api/client';
import {
  disclosureLabel,
  type EnhancementCapability,
  type EnhancementProvenance,
} from '@/lib/api/services/mediaEnhancement';
import type { AiPhase } from './usePhotoEditWorkflow';

interface EnhanceControlsProps {
  aiPhase: AiPhase;
  aiError: string | null;
  capability: EnhancementCapability | null;
  selectedOpId: string | null;
  setSelectedOpId: (id: string | null) => void;
  selectedPresetId: string | null;
  setSelectedPresetId: (id: string | null) => void;
  selectedSceneId: string | null;
  setSelectedSceneId: (id: string | null) => void;
  presets: ReturnType<typeof import('@/lib/api/services/mediaEnhancement').derivePresetsFromOperations>;
  scenes: ReturnType<typeof import('@/lib/api/services/mediaEnhancement').getBackgroundScenes>;
  showScenes: boolean;
  canApplyAi: boolean;
  aiProvenance: EnhancementProvenance | null;
  setAiPhase: (p: AiPhase) => void;
  onRetryCapability: () => void;
  onRunAiApply: () => void;
  onRevertAi: () => void;
}

export function EnhanceControls({
  aiPhase,
  aiError,
  capability,
  selectedOpId,
  setSelectedOpId,
  selectedPresetId,
  setSelectedPresetId,
  selectedSceneId,
  setSelectedSceneId,
  presets,
  scenes,
  showScenes,
  canApplyAi,
  aiProvenance,
  setAiPhase,
  onRetryCapability,
  onRunAiApply,
  onRevertAi,
}: EnhanceControlsProps) {
  return (
    <div className="mt-4 space-y-4">
      {aiPhase === 'checking' || aiPhase === 'idle' ? (
        <p className="text-caption text-text-secondary">Checking availability…</p>
      ) : null}

      {aiPhase === 'unavailable' ? (
        <div>
          <p className="text-body-emphasis font-medium text-text-primary">
            Not yet available
          </p>
          <p className="mt-1 text-caption text-text-secondary">
            AI photo enhancement is being prepared. Your original photo is
            unchanged — the crop and adjust tools still work on the real
            pixels.
          </p>
          {DATA_MODE === 'live' ? (
            <button
              type="button"
              onClick={onRetryCapability}
              className="pressable mt-2 text-caption font-semibold text-text-primary underline-offset-4 hover:underline"
            >
              Check again
            </button>
          ) : null}
        </div>
      ) : null}

      {aiPhase === 'error' ? (
        <div>
          <p className="text-body-emphasis font-medium text-danger-text">
            Something went wrong
          </p>
          <p className="mt-1 text-caption text-text-secondary">{aiError}</p>
          <button
            type="button"
            onClick={() => setAiPhase('available')}
            className="pressable mt-2 text-caption font-semibold text-text-primary underline-offset-4 hover:underline"
          >
            Try again
          </button>
        </div>
      ) : null}

      {aiPhase === 'submitting' ? (
        <div className="flex items-center gap-2">
          <Spinner size={16} tone="neutral" />
          <p className="text-caption text-text-secondary">Enhancing…</p>
        </div>
      ) : null}

      {aiPhase === 'available' && capability ? (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Enhancement tools">
            {capability.operations.map((op) => (
              <button
                key={op.id}
                type="button"
                aria-pressed={selectedOpId === op.id}
                title={op.description}
                onClick={() => {
                  setSelectedOpId(selectedOpId === op.id ? null : op.id);
                  setSelectedPresetId(null);
                }}
                className={`pressable h-9 rounded-full border px-4 text-body font-medium ${
                  selectedOpId === op.id
                    ? 'border-brand bg-brand text-text-inverse'
                    : 'border-border-subtle text-text-primary hover:border-text-muted'
                }`}
              >
                {op.label}
              </button>
            ))}
          </div>

          {presets.length ? (
            <div>
              <p className="mb-2 text-caption text-text-muted">Presets</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Enhancement presets">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={selectedPresetId === p.id}
                    title={p.description}
                    onClick={() => {
                      setSelectedPresetId(selectedPresetId === p.id ? null : p.id);
                      setSelectedOpId(null);
                    }}
                    className={`pressable h-9 rounded-full border px-4 text-body font-medium ${
                      selectedPresetId === p.id
                        ? 'border-brand bg-brand-subtle text-text-primary'
                        : 'border-border-subtle text-text-secondary hover:border-text-muted'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {showScenes ? (
            <div>
              <p className="mb-2 text-caption text-text-muted">Background</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Background scenes">
                {scenes.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={selectedSceneId === s.id}
                    onClick={() =>
                      setSelectedSceneId(selectedSceneId === s.id ? null : s.id)
                    }
                    className={`pressable h-9 rounded-full border px-4 text-body font-medium ${
                      selectedSceneId === s.id
                        ? 'border-brand bg-brand text-text-inverse'
                        : 'border-border-subtle text-text-primary hover:border-text-muted'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <Button
            variant="secondary"
            size="sm"
            disabled={!canApplyAi}
            onClick={() => void onRunAiApply()}
          >
            Apply enhancement
          </Button>
        </>
      ) : null}

      {aiProvenance ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-subtle pt-3">
          <p className="text-caption text-text-muted">
            {disclosureLabel(aiProvenance.disclosureType)} · {aiProvenance.provider}
          </p>
          <button
            type="button"
            onClick={onRevertAi}
            className="pressable text-caption font-semibold text-text-primary underline-offset-4 hover:underline"
          >
            Revert to original
          </button>
        </div>
      ) : null}
    </div>
  );
}
