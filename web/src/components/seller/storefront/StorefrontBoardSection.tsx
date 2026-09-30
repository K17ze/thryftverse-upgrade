'use client';

import { SellField } from '@/components/sell/SellField';
import { TEXTAREA_CLASS } from './StorefrontPrimitives';

interface StorefrontBoardSectionProps {
  announcement: string;
  onAnnouncementChange: (value: string) => void;
  shipping: string;
  onShippingChange: (value: string) => void;
  returnsPolicy: string;
  onReturnsPolicyChange: (value: string) => void;
  additional: string;
  onAdditionalChange: (value: string) => void;
  busy: boolean;
}

export function StorefrontBoardSection({
  announcement,
  onAnnouncementChange,
  shipping,
  onShippingChange,
  returnsPolicy,
  onReturnsPolicyChange,
  additional,
  onAdditionalChange,
  busy,
}: StorefrontBoardSectionProps) {
  return (
    <section aria-label="Shop board" className="mt-10">
      <h2 className="text-section-title font-semibold text-text-primary">Shop board</h2>
      <div className="mt-5 space-y-6">
        <SellField
          id="sf-announcement"
          label="Announcement"
          optional
          hint="Pinned to the top of your shop — drop dates, restock notes, bundle deals."
        >
          <textarea
            id="sf-announcement"
            className={TEXTAREA_CLASS}
            rows={3}
            maxLength={500}
            value={announcement}
            onChange={(e) => onAnnouncementChange(e.target.value)}
            disabled={busy}
            placeholder="A note shown at the top of your shop…"
          />
        </SellField>
        <SellField id="sf-shipping" label="Shipping policy" optional>
          <textarea
            id="sf-shipping"
            className={TEXTAREA_CLASS}
            rows={2}
            maxLength={500}
            value={shipping}
            onChange={(e) => onShippingChange(e.target.value)}
            disabled={busy}
            placeholder="e.g. Dispatches within 2 days, tracked shipping"
          />
        </SellField>
        <SellField id="sf-returns" label="Returns policy" optional>
          <textarea
            id="sf-returns"
            className={TEXTAREA_CLASS}
            rows={2}
            maxLength={500}
            value={returnsPolicy}
            onChange={(e) => onReturnsPolicyChange(e.target.value)}
            disabled={busy}
            placeholder="e.g. Returns accepted within 14 days"
          />
        </SellField>
        <SellField id="sf-additional" label="Additional policies" optional>
          <textarea
            id="sf-additional"
            className={TEXTAREA_CLASS}
            rows={2}
            maxLength={500}
            value={additional}
            onChange={(e) => onAdditionalChange(e.target.value)}
            disabled={busy}
            placeholder="Anything else buyers should know…"
          />
        </SellField>
      </div>
    </section>
  );
}
