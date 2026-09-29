import { SettingsRail } from '@/components/settings/SettingsRail';

/**
 * Settings layout — below lg the pages render exactly as they did
 * (list→page nav on a max-w-2xl column). At lg the tree composes as a
 * persistent left nav rail (~248px, sticky) + a ~720px content column,
 * the Linear/Vinted settings grammar.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:mx-auto lg:w-full lg:max-w-[1440px] lg:px-6">
      <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-10 xl:gap-14">
        <SettingsRail />
        <div className="min-w-0 lg:max-w-[720px]">{children}</div>
      </div>
    </div>
  );
}
