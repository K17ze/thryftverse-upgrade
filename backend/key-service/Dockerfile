FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app

USER app

EXPOSE 4100

CMD ["npm", "run", "serve"]
