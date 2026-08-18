import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { getIconDefinition, isIconAllowedInContext, type IconVariant } from './iconRegistry';

export interface SemanticIconProps {
  name: string; // semantic name from the registry
  size?: number;
  color?: string; // override; defaults to theme color role
  context?: string; // validates against allowedContexts
  variant?: IconVariant;
  accessibilityLabel?: string;
  decorative?: boolean; // if true, aria-hidden
}

export function SemanticIcon({ name, size, color, context, variant, accessibilityLabel, decorative }: SemanticIconProps) {
  const { colors } = useAppTheme();
  const def = getIconDefinition(name);

  // Fallback: try as direct Ionicons name for backward compat
  if (!def) {
    return <Ionicons name={name as any} size={size ?? 20} color={color ?? colors.textPrimary} />;
  }

  // Context validation (dev only)
  if (__DEV__ && context && !isIconAllowedInContext(name, context)) {
    console.warn(
      `SemanticIcon "${name}" is not allowed in context "${context}". Allowed: ${def.allowedContexts.join(', ')}`,
    );
  }

  const resolvedSize = size ?? def.defaultSize;
  const resolvedColor =
    color ??
    (def.colorRole ? (colors as unknown as Record<string, string>)[def.colorRole] : undefined) ??
    colors.textPrimary;
  const ioniconsName =
    (variant === 'filled' && def.variants?.includes('filled')
      ? def.systemName?.replace('-outline', '')
      : def.systemName) ?? name;

  if (def.customComponent) {
    const Custom = def.customComponent;
    return <Custom size={resolvedSize} color={resolvedColor} />;
  }

  const isDecorative = decorative ?? def.decorative;

  return (
    <Ionicons
      name={ioniconsName as any}
      size={resolvedSize}
      color={resolvedColor}
      accessibilityLabel={isDecorative ? undefined : accessibilityLabel}
      aria-hidden={isDecorative}
    />
  );
}
