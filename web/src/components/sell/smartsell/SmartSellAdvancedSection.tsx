'use client';

import type { KeyboardEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Chip } from '@/components/ui/Chip';
import { Switch } from '@/components/settings/Switch';
import type { SmartSellPolicy } from '@/lib/api/services/smartSell';
import { sanitizePriceInput } from '../constants';
import { INPUT_CLASS } from '../SellField';
import type { SmartSellWrite } from './useSmartSellWorkflow';

interface SmartSellAdvancedSectionProps {
  showAdvanced: boolean;
  setShowAdvanced: React.Dispatch<React.SetStateAction<boolean>>;
  isLive: boolean;
  busy: boolean;
  policy: SmartSellPolicy;
  counterStrategy: 'firm' | 'gradual' | null;
  floorText: string;
  setFloorText: (v: string) => void;
  declineText: string;
  setDeclineText: (v: string) => void;
  roundsText: string;
  setRoundsText: (v: string) => void;
  setNotice: (v: string | null) => void;
  commitFloor: () => void;
  commitDecline: () => void;
  commitRounds: () => void;
  commitOnEnter: (e: KeyboardEvent<HTMLInputElement>) => void;
  onWrite: (w: SmartSellWrite) => void;
}

export function SmartSellAdvancedSection({
  showAdvanced,
  setShowAdvanced,
  isLive,
  busy,
  policy,
  counterStrategy,
  floorText,
  setFloorText,
  declineText,
  setDeclineText,
  roundsText,
  setRoundsText,
  setNotice,
  commitFloor,
  commitDecline,
  commitRounds,
  commitOnEnter,
  onWrite,
}: SmartSellAdvancedSectionProps) {
  return (
    <>
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        aria-expanded={showAdvanced}
        className="pressable mt-4 flex w-full items-center justify-between border-y border-border-subtle py-2.5 text-left"
      >
        <span className="text-meta uppercase tracking-wide text-text-secondary">
          Advanced
        </span>
        <Icon
          name={showAdvanced ? 'chevronUp' : 'chevronDown'}
          size={16}
          className="text-text-muted"
        />
      </button>

      {showAdvanced ? (
        <div className="pt-4">
          <label
            htmlFor="smart-sell-floor"
            className="block text-caption font-medium text-text-secondary"
          >
            {isLive ? 'Floor price (gross)' : 'Auto-accept at (gross)'}
          </label>
          <div className="relative mt-1.5 max-w-[220px]">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body text-text-muted">
              £
            </span>
            <input
              id="smart-sell-floor"
              type="text"
              inputMode="decimal"
              value={floorText}
              onChange={(e) => {
                setNotice(null);
                setFloorText(sanitizePriceInput(e.target.value));
              }}
              onBlur={commitFloor}
              onKeyDown={commitOnEnter}
              placeholder="0.00"
              maxLength={9}
              disabled={busy}
              className={`tnum ${INPUT_CLASS} pl-7`}
            />
          </div>
          <p className="mt-1.5 text-caption text-text-muted">
            {isLive
              ? 'Smart Sell never accepts or counters below this amount.'
              : 'Accept offers at or above this gross amount.'}
          </p>

          {isLive ? (
            <>
              <div className="mt-5">
                <span className="block text-caption font-medium text-text-secondary">
                  Counter strategy
                </span>
                <div
                  className="mt-1.5 flex gap-1.5"
                  role="group"
                  aria-label="Counter strategy"
                >
                  <Chip
                    selected={counterStrategy === 'gradual'}
                    disabled={busy}
                    onClick={() =>
                      onWrite({
                        kind: 'counterStrategy',
                        counterStrategy: 'gradual',
                      })
                    }
                  >
                    Gradual
                  </Chip>
                  <Chip
                    selected={counterStrategy === 'firm'}
                    disabled={busy}
                    onClick={() =>
                      onWrite({ kind: 'counterStrategy', counterStrategy: 'firm' })
                    }
                  >
                    Firm
                  </Chip>
                </div>
                <p className="mt-1.5 text-caption text-text-muted">
                  Gradual meets buyers halfway each round; firm counters at your floor.
                </p>
              </div>

              <div className="mt-5">
                <label
                  htmlFor="smart-sell-rounds"
                  className="block text-caption font-medium text-text-secondary"
                >
                  Max counter rounds
                </label>
                <input
                  id="smart-sell-rounds"
                  type="text"
                  inputMode="numeric"
                  value={roundsText}
                  onChange={(e) => {
                    setNotice(null);
                    setRoundsText(e.target.value.replace(/[^0-9]/g, '').slice(0, 2));
                  }}
                  onBlur={commitRounds}
                  onKeyDown={commitOnEnter}
                  placeholder="3"
                  disabled={busy}
                  className={`tnum mt-1.5 ${INPUT_CLASS} max-w-[90px]`}
                />
              </div>
            </>
          ) : (
            <>
              <div className="mt-5 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <span className="block text-caption font-medium text-text-secondary">
                    Auto-decline low offers
                  </span>
                  <p className="mt-1 text-caption text-text-muted">
                    Decline offers below your floor automatically.
                  </p>
                </div>
                <Switch
                  checked={policy.autoDeclineEnabled}
                  onChange={(next) =>
                    onWrite({ kind: 'autoDecline', enabled: next })
                  }
                  aria-label="Toggle auto-decline"
                  disabled={busy}
                />
              </div>
              {policy.autoDeclineEnabled ? (
                <div className="mt-4">
                  <label
                    htmlFor="smart-sell-decline"
                    className="block text-caption font-medium text-text-secondary"
                  >
                    Decline below (gross)
                  </label>
                  <div className="relative mt-1.5 max-w-[220px]">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body text-text-muted">
                      £
                    </span>
                    <input
                      id="smart-sell-decline"
                      type="text"
                      inputMode="decimal"
                      value={declineText}
                      onChange={(e) => {
                        setNotice(null);
                        setDeclineText(sanitizePriceInput(e.target.value));
                      }}
                      onBlur={commitDecline}
                      onKeyDown={commitOnEnter}
                      placeholder="0.00"
                      maxLength={9}
                      disabled={busy}
                      className={`tnum ${INPUT_CLASS} pl-7`}
                    />
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
