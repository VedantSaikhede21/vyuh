# syntax=docker/dockerfile:1
# VYUH web image. Build from the repo root:
#   docker build -f apps/web/Dockerfile -t vyuh-web .
# NEXT_PUBLIC_* values are compiled in, so they are build arguments.
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/
ARG NODE_HEAP_MB=2048
ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
ARG NEXT_PUBLIC_AUTH_MODE=local
ARG NEXT_PUBLIC_GUEST_MODE=false
ARG NEXT_PUBLIC_SUPABASE_URL=
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_AUTH_MODE=$NEXT_PUBLIC_AUTH_MODE \
    NEXT_PUBLIC_GUEST_MODE=$NEXT_PUBLIC_GUEST_MODE \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_TELEMETRY_DISABLED=1 \
    VYUH_STANDALONE=1
RUN pnpm install --frozen-lockfile --filter @vyuh/web...
RUN NODE_OPTIONS=--max-old-space-size=${NODE_HEAP_MB} pnpm --filter @vyuh/web build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
