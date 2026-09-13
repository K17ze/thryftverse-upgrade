import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { createFilterStyles } from './filterStyles';

interface Props {
  /** Lowercase domain key ('sort', 'brand', …) — drives the expand/collapse
   *  accessibility label exactly as the original inline headers did. */
  sectionKey: string;
  /** Visible heading text ('Sort By', 'Brand', …). */
  title: string;
  expanded: boolean;
  onToggle: () => void;
  /** When provided, the heading renders inside the flex row with a count
   *  badge that appears only while count > 0 (matches the original brand /
   *  size / condition / price headers). Omit for plain headings. */
  count?: number;
  children?: React.ReactNode;
}

// Collapsible section header shared by every filter domain section.
// Progressive disclosure per 2026 mobile filter UX — children render only
// while expanded, matching the original conditional render exactly.
function FilterSectionBase({ sectionKey, title, expanded, onToggle, count, children }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);

  return (
    <>
      <Pressable
        style={styles.collapsibleHeader}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={expanded ? `Collapse ${sectionKey} section` : `Expand ${sectionKey} section`}
        accessibilityState={{ expanded }}
      >
        {count !== undefined ? (
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>{title}</Text>
            {count > 0 && (
              <View style={styles.sectionCountBadge}>
                <Text style={styles.sectionCountBadgeText}>{count}</Text>
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.sectionHeading}>{title}</Text>
        )}
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} aria-hidden={true} />
      </Pressable>
      {expanded && children}
    </>
  );
}

const FilterSection = React.memo(FilterSectionBase);
FilterSection.displayName = 'FilterSection';
export { FilterSection };
