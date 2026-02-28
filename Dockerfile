FROM node:22-slim AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci --workspace=packages/shared --workspace=packages/server --workspace=packages/client

# Copy source
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY packages/client/ packages/client/

# Build shared → server → client
RUN npm run build -w packages/shared && \
    npm run build -w packages/server && \
    npm run build -w packages/client

# ─── Production image ────────────────────────────────────────────────
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

# Install production deps only
RUN npm ci --workspace=packages/shared --workspace=packages/server --omit=dev

# Copy built artifacts
COPY --from=base /app/packages/shared/dist packages/shared/dist
COPY --from=base /app/packages/server/dist packages/server/dist
COPY --from=base /app/packages/client/dist packages/client/dist

# Data directory for SQLite
RUN mkdir -p /app/data
VOLUME /app/data

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "packages/server/dist/index.js"]
