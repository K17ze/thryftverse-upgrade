import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['*.password', '*.token', '*.secret', '*.apiKey'],
});

export default logger;
