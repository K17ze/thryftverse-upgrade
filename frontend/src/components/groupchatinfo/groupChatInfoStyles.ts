/**
 * groupChatInfoStyles — static layout styles for the group details screen
 * and its extracted header/not-found components. Extracted verbatim from
 * GroupChatInfoScreen; token-only, no hex literals.
 */

import { StyleSheet } from 'react-native';
import { Control, Space } from '../../theme/designTokens';

export const styles = StyleSheet.create({
  content: {
    gap: Space.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAction: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directorySection: {
    marginBottom: Space.lg,
  },
  provenanceFootnote: {
    alignItems: 'center',
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
  },
});
