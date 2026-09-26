'use client';

/**
 * ArticleAccordion — popular-articles disclosure, ported from the help
 * centre's FaqRow grammar: full-width 44px+ target, chevron rotation,
 * hairline separators. Single-open behaviour.
 */

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { SupportArticle } from '@/lib/data/fixtures-support';

interface ArticleAccordionProps {
  articles: SupportArticle[];
}

export function ArticleAccordion({ articles }: ArticleAccordionProps) {
  const [openId, setOpenId] = useState<string | null>(articles[0]?.id ?? null);

  return (
    <div className="border-t border-border-subtle">
      {articles.map((article) => {
        const open = openId === article.id;
        return (
          <div key={article.id} className="border-b border-border-subtle">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : article.id)}
              aria-expanded={open}
              className="pressable flex min-h-[56px] w-full items-center gap-3 py-3.5 text-left"
            >
              <span className="flex-1 text-body-emphasis font-medium text-text-primary">
                {article.q}
              </span>
              <Icon
                name="chevronDown"
                size={18}
                className={`shrink-0 text-text-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
              />
            </button>
            {open ? (
              <p className="pb-5 pr-8 text-body leading-relaxed text-text-secondary">{article.a}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
