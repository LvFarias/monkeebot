# syntax=docker/dockerfile:1.6

ARG NODE_VERSION=20
ARG TARGETPLATFORM
ARG BUILDPLATFORM

FROM node:${NODE_VERSION}-bullseye AS deps
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ make python3 \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:${NODE_VERSION}-bullseye-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    COOPS_DB_PATH=/app/data/coops.db
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node . .
RUN mkdir -p /app/data \
    && chown -R node:node /app
USER node
CMD ["node", "index.js"]
