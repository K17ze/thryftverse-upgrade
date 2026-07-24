import React from 'react';
import { Ionicons } from '@expo/vector-icons';

type AgentIconName = keyof typeof Ionicons.glyphMap;

function resolveAgentIcon(category?: string, name?: string): AgentIconName {
  const identity = `${category || ''} ${name || ''}`.toLowerCase();

  if (identity.includes('guard') || identity.includes('moderation')) {
    return 'shield-checkmark-outline';
  }
  if (identity.includes('trade') || identity.includes('market')) {
    return 'pulse-outline';
  }
  if (identity.includes('brief') || identity.includes('digest')) {
    return 'newspaper-outline';
  }
  if (identity.includes('deal') || identity.includes('commerce')) {
    return 'pricetags-outline';
  }
  if (identity.includes('safety') || identity.includes('scam')) {
    return 'lock-closed-outline';
  }
  if (identity.includes('style') || identity.includes('wardrobe')) {
    return 'color-palette-outline';
  }
  if (identity.includes('automation') || identity.includes('schedule')) {
    return 'timer-outline';
  }

  return 'chatbubble-ellipses-outline';
}

export function AgentIcon({
  category,
  name,
  size = 21,
  color,
}: {
  category?: string;
  name?: string;
  size?: number;
  color: string;
}) {
  return (
    <Ionicons
      name={resolveAgentIcon(category, name)}
      size={size}
      color={color}
    />
  );
}
