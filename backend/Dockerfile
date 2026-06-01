# Backend (Express + Prisma + bot worker). BUILD CONTEXT = repo root (saas-platform/).
# On Railway set: Root Directory = saas-platform, Dockerfile Path = backend/Dockerfile.
FROM node:20-slim
WORKDIR /app
# openssl is required by Prisma's query engine
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Install workspace deps (root package.json drives the npm workspaces)
COPY package*.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
RUN npm install

# Build shared → generate Prisma client (linux engine) → build backend
COPY shared/ shared/
COPY backend/ backend/
RUN npm run build --workspace=shared \
 && npx prisma generate --schema backend/prisma/schema.prisma \
 && npm run build --workspace=backend

WORKDIR /app/backend
EXPOSE 4000
# RUN_WORKERS=true (default) runs the per-tenant bot manager in-process.
# The DB schema is already synced on Supabase; no migration step needed at boot.
CMD ["node", "dist/index.js"]
