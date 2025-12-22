FROM oven/bun:1 AS base

# Set working directory
WORKDIR /app

# Install ripgrep for content search
USER root
RUN apt-get update && apt-get install -y ripgrep && rm -rf /var/lib/apt/lists/*
RUN chown -R bun:bun /app
USER bun

# Copy package files for dependency installation
COPY --chown=bun:bun package.json bun.lock ./

# Install dependencies (ignore scripts since source code not copied yet)
RUN bun install --frozen-lockfile --production --ignore-scripts

# Copy source code and configuration
COPY --chown=bun:bun . .

# Run asset copy script to populate public/ directory
RUN bun run scripts/copy-assets.ts

# Switch to non-root user
USER bun

# Expose port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["bun", "run", "src/main.ts"]
