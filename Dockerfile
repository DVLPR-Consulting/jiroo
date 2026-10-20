FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
# Preload the packageManager-pinned pnpm for non-root, offline maintenance runs.
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN HUSKY=0 corepack pnpm install --frozen-lockfile --store-dir=/tmp/pnpm-store \
    && rm -rf /tmp/pnpm-store

FROM deps AS build
COPY . .
RUN corepack pnpm build

# Keep tsx in this separate maintenance target; do not ship it with the app.
# Select one command per run so owner credentials never reach the app container.
FROM deps AS migrate
ENV NODE_ENV=production \
    COREPACK_ENABLE_NETWORK=0
COPY tsconfig.json ./
COPY drizzle ./drizzle
COPY lib ./lib
COPY scripts/migrate.ts scripts/db-runtime-role.ts scripts/bootstrap-admin.ts ./scripts/
USER node
CMD ["corepack", "pnpm", "db:migrate"]

# The default target is the application, with traced dependencies only.
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "const request = require('node:http').get({hostname:'127.0.0.1',port:process.env.PORT || 3000,path:'/api/health',timeout:3000}, response => { response.resume(); process.exit(response.statusCode === 200 ? 0 : 1); }); request.on('timeout', () => { request.destroy(); process.exit(1); }); request.on('error', () => process.exit(1));"]
CMD ["node", "server.js"]
