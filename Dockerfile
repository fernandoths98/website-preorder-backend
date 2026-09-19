# syntax=docker/dockerfile:1
# Multi-stage: build with devDependencies, ship without them.

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app

# Copy manifests first so `npm ci` is cached until dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Drop devDependencies from the already-installed tree — faster and more
# reproducible than a second `npm ci --omit=dev` against the network.
RUN npm prune --omit=dev

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# tini reaps zombies and forwards SIGTERM, so `docker compose restart` is clean.
RUN apk add --no-cache tini

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node assets ./assets

# Never run the API as root.
USER node

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main"]
