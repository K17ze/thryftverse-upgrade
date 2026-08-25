/**
 * Support agent turn queue job handler.
 *
 * Extracted from the inline implementation pattern used by other handlers
 * (pushHandler, auctionSweepHandler, etc.). Uses the shared `db` pool
 * singleton and the support service modules directly so it is self-contained.
 *
 * The handler is idempotent: if the conversation is no longer in `ai_active`
 * state (e.g. a human has taken over), it returns without generating an AI
 * response.
 */
import { db } from '../../db/pool.js';
import { processSupportTurn } from '../../support/supportAgentTurnHandler.js';
import { publishRealtimeEvent } from '../../lib/realtime.js';
import { logger } from '../../lib/logger.js';

export interface SupportAgentTurnJobData {
  conversationId: string;
  customerMessageId: string;
}

export type SupportAgentTurnHandlerDeps = {
  /** Uses the shared db singleton; no injected deps needed. */
};

/**
 * Processes a support agent turn job. The job is enqueued when a customer
 * sends a message in a support conversation. The handler:
 *
 * 1. Loads the conversation and customer message
 * 2. Classifies intent/risk via the routing service
 * 3. Either hands off to a human (high-risk) or generates a cited AI response
 * 4. Publishes a realtime event so the mobile client can update the thread
 *
 * If the conversation ownership has changed (e.g. human took over) between
 * enqueue and processing, the handler exits without generating AI output.
 */
export async function processSupportAgentTurnJob(
  job: SupportAgentTurnJobData,
): Promise<void> {
  const { conversationId, customerMessageId } = job;

  logger.info(
    { conversationId, customerMessageId },
    '[supportAgentTurnHandler] processing support agent turn',
  );

  try {
    const result = await processSupportTurn(db, conversationId, customerMessageId);

    // Publish a realtime event so the mobile client can refresh the thread.
    await publishRealtimeEvent({
      topic: `support:${conversationId}`,
      type: 'support.message',
      payload: {
        conversationId: result.conversationId,
        messageId: result.messageId,
        handoffId: result.handoffId,
        actionProposalId: result.actionProposalId,
        routing: {
          issueType: result.routing.issueType,
          riskTier: result.routing.riskTier,
          requiresHandoff: result.routing.requiresHandoff,
        },
      },
    });

    logger.info(
      {
        conversationId,
        messageId: result.messageId,
        handoffId: result.handoffId,
        evidenceSignals: result.evidenceSignals,
      },
      '[supportAgentTurnHandler] support agent turn completed',
    );
  } catch (err) {
    logger.error(
      { conversationId, customerMessageId, error: (err as Error).message },
      '[supportAgentTurnHandler] support agent turn failed',
    );
    throw err;
  }
}
