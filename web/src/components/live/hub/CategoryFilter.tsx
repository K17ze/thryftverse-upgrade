'use client';

import { Chip } from '@/components/ui/Chip';

interface CategoryFilterProps {
  categories: string[];
  category: string;
  onChange: (next: string) => void;
  className?: string;
}

export function CategoryFilter({
  categories,
  category,
  onChange,
  className,
}: CategoryFilterProps) {
  return (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`} role="group" aria-label="Filter by category">
      <Chip selected={category === 'all'} onClick={() => onChange('all')}>
        All
      </Chip>
      {categories.map((name) => (
        <Chip key={name} selected={category === name} onClick={() => onChange(name)}>
          {name}
        </Chip>
      ))}
    </div>
  );
}
