'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import type { SellerTodo } from '@/lib/data/fixtures-seller';

interface SellerOpsRadarProps {
  todos?: SellerTodo[];
  className?: string;
}

export function SellerOpsRadar({ todos, className = '' }: SellerOpsRadarProps) {
  if (!todos || todos.length === 0) return null;

  return (
    <nav aria-label="To do" className={`mt-8 ${className}`}>
      <div className="flex items-baseline justify-between pb-2">
        <h2 className="text-label text-text-muted">To do</h2>
        <span className="tnum text-meta text-text-muted">
          {todos.length} {todos.length === 1 ? 'item' : 'items'}
        </span>
      </div>
      <ul className="divide-y divide-border-subtle border-y border-border-subtle">
        {todos.map((t) => (
          <li key={t.id}>
            <Link
              href={t.href}
              className="pressable flex items-center gap-3 py-3"
            >
              <Icon
                name={t.kind === 'dispatch' ? 'box' : t.kind === 'offers' ? 'offer' : 'trending'}
                size={18}
                className={
                  t.tone === 'danger'
                    ? 'text-danger-text'
                    : t.tone === 'warning'
                      ? 'text-warning-text'
                      : 'text-text-muted'
                }
              />
              <span className="min-w-0 flex-1">
                <span
                  className={`clamp-1 text-body-emphasis font-medium ${
                    t.tone === 'danger' ? 'text-danger-text' : 'text-text-primary'
                  }`}
                >
                  {t.title}
                </span>
                <span className="mt-0.5 block text-meta text-text-muted">{t.meta}</span>
              </span>
              <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
