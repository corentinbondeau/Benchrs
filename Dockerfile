# ============================================================
# Benchrs — Production Dockerfile
# Multi-stage build pour optimiser la taille image
# ============================================================

FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm install --production

FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app

# Copier dépendances de production
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]
