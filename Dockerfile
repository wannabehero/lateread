FROM oven/bun:1 AS builder

WORKDIR /app
COPY package.json bun.lock ./
COPY scripts ./scripts

# Post install we do the copy
RUN bun ci

# Final image

FROM oven/bun:1 AS runtime

WORKDIR /app

# Install ripgrep for content search
USER root
RUN apt-get update && apt-get install -y ripgrep && rm -rf /var/lib/apt/lists/*
RUN chown -R bun:bun /app
USER bun

COPY --chown=bun:bun package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

COPY --chown=bun:bun . .
COPY --chown=bun:bun --from=builder /app/public ./public

EXPOSE 3000

CMD ["bun", "run", "src/main.ts"]
