FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Copy migration SQL files so the compiled migrate.js can read them at runtime.
COPY --from=builder /app/src/db/migrations ./dist/db/migrations

RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app && chown -R app:app /app

USER app

EXPOSE 4000

# Run migrations using compiled JS (no tsx in runtime image), then start the server.
# MIGRATE_DATABASE_URL bypasses PgBouncer for DDL statements that need a direct connection.
CMD ["sh", "-c", "DATABASE_URL=${MIGRATE_DATABASE_URL:-$DATABASE_URL} node dist/db/migrate.js && node --enable-source-maps dist/index.js"]
