# KloudLab frontend: Vite build, served by nginx-unprivileged on 8080.
# Build from apps/frontend: docker build -t kloudlab-frontend \
#   --build-arg VITE_AUTH0_DOMAIN=... apps/frontend
# VITE_* values are baked into the bundle at build time; they are
# public (shipped to every browser), never secrets.
FROM node:24-alpine AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# newer corepack carries current pnpm signing keys
RUN npm install -g corepack@latest && corepack enable
COPY package.json pnpm-lock.yaml ./
# pnpm stops on unapproved install scripts (browser-tabs-lock, from the
# Auth0 SDK); none is needed for the build, so skip them
RUN pnpm install --frozen-lockfile --config.strict-dep-builds=false
# only the sources: no local .env file reaches the build
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json \
  tsconfig.node.json ./
COPY src ./src
ARG VITE_AUTH0_DOMAIN
ARG VITE_AUTH0_CLIENT_ID
ARG VITE_AUTH0_AUDIENCE
ARG VITE_API_BASE_URL=https://api.kloudlab.in/api
ENV VITE_AUTH0_DOMAIN=$VITE_AUTH0_DOMAIN \
  VITE_AUTH0_CLIENT_ID=$VITE_AUTH0_CLIENT_ID \
  VITE_AUTH0_AUDIENCE=$VITE_AUTH0_AUDIENCE \
  VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN if [ -z "$VITE_AUTH0_DOMAIN" ] || [ "$VITE_AUTH0_DOMAIN" = "REPLACE_ME.auth0.com" ] || \
      [ -z "$VITE_AUTH0_CLIENT_ID" ] || [ "$VITE_AUTH0_CLIENT_ID" = "REPLACE_ME" ] || \
      [ -z "$VITE_AUTH0_AUDIENCE" ] || [ "$VITE_AUTH0_AUDIENCE" = "REPLACE_ME" ]; then \
      echo "VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID, and VITE_AUTH0_AUDIENCE must be configured." >&2; \
      exit 1; \
    fi
RUN pnpm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
