import { Icon, type AppIconName } from '@/components/ui/Icon';

/**
 * AgentIcon — port of mobile components/agents/AgentIcon.tsx.
 * Category + name resolve to one semantic glyph from the AppIcon family;
 * same resolution grammar as mobile (guard→shield, trade→trending,
 * style→palette, automation→clock, default→chat bubble).
 */
export function resolveAgentIcon(
  category?: string,
  name?: string,
): AppIconName {
  const identity = `${category ?? ''} ${name ?? ''}`.toLowerCase();

  if (identity.includes('guard') || identity.includes('moderation')) {
    return 'shieldCheck';
  }
  if (identity.includes('trade') || identity.includes('market')) {
    return 'trending';
  }
  if (identity.includes('brief') || identity.includes('digest')) {
    return 'feed';
  }
  if (identity.includes('deal') || identity.includes('commerce')) {
    return 'cart';
  }
  if (identity.includes('safety') || identity.includes('scam')) {
    return 'lock';
  }
  if (identity.includes('style') || identity.includes('wardrobe')) {
    return 'palette';
  }
  if (identity.includes('automation') || identity.includes('schedule')) {
    return 'clock';
  }
  return 'inbox';
}

export function AgentIcon({
  category,
  name,
  size = 21,
  className,
}: {
  category?: string;
  name?: string;
  size?: number;
  className?: string;
}) {
  return (
    <Icon
      name={resolveAgentIcon(category, name)}
      size={size}
      className={className}
    />
  );
}
