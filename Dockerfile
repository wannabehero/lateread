FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun ci

# Only bundling the frontend bits
COPY ./web ./web
RUN bun run build:web

FROM oven/bun:1 AS final

WORKDIR /app

# Install ripgrep for content search
USER root
RUN apt-get update && apt-get install -y ripgrep && rm -rf /var/lib/apt/lists/*
RUN chown -R bun:bun /app
USER bun

COPY --chown=bun:bun package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --chown=bun:bun . .
COPY --chown=bun:bun --from=build /app/public ./public

EXPOSE 3000

CMD ["bun", "src/main.ts"]
