# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS builder
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_BASE_URL=http://localhost:18081
ARG NEXT_PUBLIC_DOMAIN=http://localhost:18080
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ARG NEXT_PUBLIC_ALLOWED_ROLES=admin,staff,student,superadmin,superuser,canteen
ARG NEXT_PUBLIC_DEFAULT_ADMIN_VIEW=dashboard
ARG NEXT_PUBLIC_SMS_PORTAL
ARG NEXT_PUBLIC_SMS_TOKEN_PAGE
ARG NEXT_PUBLIC_SENTRY=off
ARG NEXT_PUBLIC_SENTRY_FEEDBACK=off
ARG NEXT_PUBLIC_SENTRY_DSN
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
