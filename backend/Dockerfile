FROM node:24-alpine AS deps
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmmirror.com
COPY package*.json ./
RUN npm config set registry ${NPM_REGISTRY} \
  && npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm install --no-audit --no-fund

FROM deps AS build
COPY prisma ./prisma
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package*.json ./
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
