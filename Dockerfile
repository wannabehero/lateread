FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun ci

# Only bundling the frontend bits
COPY ./web ./web
RUN bun run build:web

FROM oven/bun:1 AS final

ARG LITESTREAM_VERSION=0.5.6

WORKDIR /app

# Install ripgrep for content search and download Litestream
USER root
RUN apt-get update && \
    apt-get install -y ripgrep wget && \
    wget -qO- "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-x86_64.tar.gz" | tar xz -C /usr/local/bin && \
    rm -rf /var/lib/apt/lists/*
RUN chown -R bun:bun /app
USER bun

COPY --chown=bun:bun package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --chown=bun:bun . .
COPY --chown=bun:bun --from=build /app/public ./public

# Copy Litestream config and entrypoint
COPY --chown=bun:bun etc/litestream.yml /etc/litestream.yml
COPY --chown=bun:bun scripts/run.sh /scripts/run.sh

EXPOSE 3000

ENTRYPOINT ["/scripts/run.sh"]
