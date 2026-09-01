FROM oven/bun:1.4.0 AS install
WORKDIR /app

COPY package.json bun.lock* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN bun install --frozen-lockfile || bun install

FROM oven/bun:1.4.0 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=install /app/node_modules ./node_modules
COPY package.json tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts
COPY packages/database ./packages/database
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
