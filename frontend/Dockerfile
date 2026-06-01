# Frontend (Next.js 15). BUILD CONTEXT = repo root (saas-platform/).
# On Railway set: Root Directory = saas-platform, Dockerfile Path = frontend/Dockerfile,
# and a build ARG NEXT_PUBLIC_API_URL = your backend's public https URL.
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

# NEXT_PUBLIC_* must be present at BUILD time (Next inlines it into the bundle).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package*.json ./
COPY shared/package.json shared/
COPY frontend/package.json frontend/
RUN npm install

COPY shared/ shared/
COPY frontend/ frontend/
RUN npm run build --workspace=shared \
 && npm run build --workspace=frontend

WORKDIR /app/frontend
EXPOSE 3000
# Honour Railway's $PORT; fall back to 3000 locally.
CMD ["sh", "-c", "npx next start -p ${PORT:-3000}"]
