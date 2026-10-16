# --- build the React app ---
FROM node:22-bookworm-slim AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# --- install server dependencies (build tools in case SQLite must be compiled) ---
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

# --- final image: the API, which also serves the built app ---
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/server
COPY --from=deps /app/server/node_modules ./node_modules
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
# SQLite database lives here — mount a persistent volume at /data
ENV DB_PATH=/data/chronos.sqlite
RUN mkdir -p /data
EXPOSE 4000
CMD ["node", "index.js"]
