FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app && chown -R app:app /app

USER app

EXPOSE 4000

CMD ["sh", "-c", "DATABASE_URL=${MIGRATE_DATABASE_URL:-$DATABASE_URL} npm run migrate && npm run serve"]
