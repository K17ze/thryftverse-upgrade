import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  pricingTablesAvailable as onezePricingTablesAvailable,
  resolveCountryPricingQuote,
} from '../lib/pricingEngine.js';

type PriceRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
};

export const registerPriceRoutes = ({ app, db }: PriceRouteDependencies) => {
  app.get('/price', async (request: FastifyRequest, reply: FastifyReply) => {
    const querySchema = z.object({
      country: z.string().min(2).max(3).default('IN'),
    });

    const payload = querySchema.parse(request.query);

    if (!(await onezePricingTablesAvailable(db))) {
      reply.code(503);
      return {
        ok: false,
        error: '1ze controlled pricing tables are unavailable. Run migrations first.',
      };
    }

    try {
      const quote = await resolveCountryPricingQuote(db, payload.country);
      return {
        ok: true,
        quote: {
          country: quote.countryCode,
          currency: quote.currency,
          principalAmount: quote.principalAmount,
          totalCost: quote.totalCost,
          netRedemption: quote.netRedemption,
          fxRate: quote.fxRate,
          loadFeeBps: quote.loadFeeBps,
          withdrawFeeBps: quote.withdrawFeeBps,
          source: quote.source,
        },
      };
    } catch (error) {
      request.log.error({ err: error, payload }, 'Failed to resolve controlled 1ze price');
      reply.code(404);
      return {
        ok: false,
        error: 'Unable to resolve 1ze price for requested country',
      };
    }
  });
};
