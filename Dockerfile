# syntax=docker/dockerfile:1
# One Node process; persistent SQLite lives on the course's /data volume.
FROM node:24-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.9.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATABASE_PATH=/data/little-post.sqlite NODE_OPTIONS=--max-old-space-size=150
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/server ./src/server
COPY --from=build /app/src/shared ./src/shared
COPY package.json README.md ASSET-CREDITS.md ./
EXPOSE 8080
CMD ["node", "src/server/index.ts"]
