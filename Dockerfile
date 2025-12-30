# Stage 1: Build stage - install all dependencies and copy assets
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install ALL dependencies (including devDependencies for pico/htmx)
RUN bun install --frozen-lockfile

# Copy build and asset scripts
COPY scripts ./scripts

# Copy public directory with source files
COPY public ./public

# Copy vendor assets (htmx, pico) from node_modules
RUN bun run scripts/copy-assets.ts

# Build and minify custom scripts and styles
RUN NODE_ENV=production bun run scripts/build-assets.ts

# Stage 2: Runtime stage - production dependencies only
FROM oven/bun:1 AS runtime

WORKDIR /app

# Install ripgrep for content search
USER root
RUN apt-get update && apt-get install -y ripgrep && rm -rf /var/lib/apt/lists/*
RUN chown -R bun:bun /app
USER bun

# Copy package files
COPY --chown=bun:bun package.json bun.lock ./

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Copy source code and configuration
COPY --chown=bun:bun . .

# Copy pre-built assets from builder stage (merges with existing public/ directory)
COPY --chown=bun:bun --from=builder /app/public ./public

# Expose port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["bun", "run", "src/main.ts"]
