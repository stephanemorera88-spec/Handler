FROM node:22-slim

# Install git (needed for Claude Code)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Copy agent-runner
COPY agent-runner/package*.json ./
RUN npm install

COPY agent-runner/ ./
RUN npm run build

# Create workspace directories
RUN mkdir -p /workspace/{group,ipc/input,ipc/output}

# Entrypoint: read stdin to temp file, run agent
RUN printf '#!/bin/bash\nset -e\ncat > /tmp/input.json\nnode /app/dist/index.js < /tmp/input.json\n' > /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Run as non-root
USER node
WORKDIR /workspace/group
ENTRYPOINT ["/app/entrypoint.sh"]
