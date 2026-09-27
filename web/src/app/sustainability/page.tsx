import type { Metadata } from 'next';
import type { AppIconName } from '@/components/ui/Icon';

export const metadata: Metadata = {
  title: 'Sustainability',
  description: 'How ThryftVerse approaches circular fashion — and what the grades mean.',
};

const GRADES: { grade: 'A' | 'B' | 'C' | 'D'; icon: AppIconName; body: string }[] = [
  {
    grade: 'A',
    icon: 'leaf',
    body: 'Heavyweight natural materials — wool coats, denim, leather, cashmere. The highest avoided footprint; buying these second-hand displaces the most production.',
  },
  {
    grade: 'B',
    icon: 'leaf',
    body: 'Durable mid-weight pieces and quality synthetics built to last — sneakers, technical outerwear, structured bags.',
  },
  {
    grade: 'C',
    icon: 'leaf',
    body: 'Lighter garments and blends with moderate avoided impact — tees, dresses, shirts.',
  },
  {
    grade: 'D',
    icon: 'leaf',
    body: 'Low-impact-per-wear items — accessories and light synthetics. Still better re-homed than binned.',
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-section-title font-semibold text-text-primary">{title}</h2>
      <div className="mt-3 space-y-4 text-body leading-relaxed text-text-secondary">
        {children}
      </div>
    </section>
  );
}

export default function SustainabilityPage() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <p className="text-label font-semibold uppercase tracking-[0.14em] text-text-muted">
        Sustainability
      </p>
      <h1 className="mt-3 text-display font-bold tracking-tight text-text-primary">
        The greenest garment already exists.
      </h1>
      <p className="mt-4 text-body-large leading-relaxed text-text-secondary">
        Fashion is one of the most resource-hungry industries on earth. Every
        resale extends a garment’s life — and every extension avoids the
        water, energy and chemistry of making a new one.
      </p>

      <Section title="Why second-hand wins">
        <p>
          Most of a garment’s footprint is locked in at production — growing
          the fibre, dyeing the cloth, sewing the seams, shipping it twice.
          Wearing a piece nine months longer is estimated to cut its carbon,
          water and waste footprint by around a fifth to a third.
        </p>
        <p>
          Resale isn’t a perfect answer — shipping and packaging have their
          own costs — but nothing else scales this fast without asking anyone
          to sacrifice style.
        </p>
      </Section>

      <Section title="The sustainability grade">
        <p>
          Each listing carries an estimated grade, A to D, based on material,
          category and typical garment weight. It’s a guide to where
          second-hand matters most — not a certification, and not a reason to
          feel bad about a D.
        </p>
        <div className="mt-5 divide-y divide-border-subtle border-y border-border-subtle">
          {GRADES.map((g) => (
            <div key={g.grade} className="flex items-start gap-4 py-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-subtle text-body-emphasis font-bold text-success-text">
                {g.grade}
              </span>
              <p className="pt-1.5 text-body leading-relaxed text-text-secondary">{g.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="What we do operationally">
        <p>
          Shipping labels are tracked and consolidated where carriers allow.
          We ask sellers to reuse packaging — a second-hand box for a
          second-hand garment — and our packaging guidance favours paper over
          plastic.
        </p>
      </Section>

      <Section title="What we don't claim">
        <p>
          Grades are estimates, not audited lifecycle assessments. We publish
          the method, not marketing. If a number on the platform can’t be
          defended, it doesn’t ship.
        </p>
      </Section>
    </div>
  );
}
