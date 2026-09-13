import type {
  SupportConversation,
  ConversationOwnershipState,
  SupportContextKind } from '../../contracts/support';
import {
  headerSubtitleFor,
  resolveSupportContext,
  type SupportContextBarModel } from '../../components/supportconversation/supportConversationViewModels';

interface UseSupportConversationDerivedOptions {
  conversation: SupportConversation | null;
  routeContextKind: SupportContextKind | undefined;
  routeContextId: string | undefined;
}

export interface SupportConversationDerived {
  ownershipState: ConversationOwnershipState;
  canRequestHandoff: boolean;
  title: string;
  headerSubtitle: string;
  context: SupportContextBarModel;
}

/**
 * useSupportConversationDerived — pure derived state for the screen:
 * ownership-driven flags (handoff eligibility), the header
 * title/subtitle, and the resolved context-bar model (conversation
 * context wins over route params, falling back to 'general').
 */
export function useSupportConversationDerived({
  conversation,
  routeContextKind,
  routeContextId }: UseSupportConversationDerivedOptions): SupportConversationDerived {
  const ownershipState: ConversationOwnershipState = conversation?.ownershipState ?? 'ai_active';
  const canRequestHandoff = ownershipState === 'ai_active';
  const title = conversation?.title ?? 'Support';
  const headerSubtitle = headerSubtitleFor(ownershipState);
  const context = resolveSupportContext(conversation, routeContextKind, routeContextId);

  return {
    ownershipState,
    canRequestHandoff,
    title,
    headerSubtitle,
    context };
}
