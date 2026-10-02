import { SettingsRail } from '@/components/settings/SettingsRail';

/**
 * Settings layout — below lg the pages render exactly as they did
 * (list→page nav on a max-w-2xl column). At lg the tree composes as a
 * persistent left rail (248px, sticky) + a ≤720px content column,
 * centred as one unit (Linear/Vinted grammar): fixed tracks +
 * justify-center, so wide viewports get balanced side margins instead
 * of a dead third on the right. On the index the rail is a section
 * jump-link TOC; on detail pages it's the destination nav (see
 * SettingsRail).
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:mx-auto lg:w-full lg:max-w-[1440px] lg:px-6">
      <div className="lg:grid lg:grid-cols-[248px_minmax(0,720px)] lg:justify-center lg:gap-10 xl:gap-14">
        <SettingsRail />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
