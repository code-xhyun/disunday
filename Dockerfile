FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN apt-get update && apt-get install -y \
    git \
    curl \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://opencode.ai/install | bash && \
    mv /root/.opencode/bin/opencode /usr/local/bin/opencode

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY discord/package.json ./discord/
COPY errore/package.json ./errore/

RUN pnpm install --frozen-lockfile

COPY . .

WORKDIR /app/discord

ENV NODE_ENV=production

CMD ["pnpm", "dev"]
