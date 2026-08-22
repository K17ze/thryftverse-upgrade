import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

type OracleRouteDependencies = {
  app: FastifyInstance;
};

export const registerOracleRoutes = ({ app }: OracleRouteDependencies) => {
  app.get('/oracle/gold/latest', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.code(410);
    return {
      ok: false,
      error: 'Gold oracle endpoint has been decommissioned for 1ze controlled pricing.',
      code: 'GOLD_ORACLE_DECOMMISSIONED',
    };
  });

  app.post('/oracle/gold/override', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.code(410);
    return {
      ok: false,
      error: 'Gold rate overrides are disabled. Use /update-anchor and /update-pricing controls instead.',
      code: 'GOLD_ORACLE_DECOMMISSIONED',
    };
  });
};
