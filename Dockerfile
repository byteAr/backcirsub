# Instalar dependencias solo cuando sea necesario
FROM node:18.18-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --frozen-lockfile

# Construcción de la aplicación con dependencias en caché
FROM node:18.18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generar Prisma Client antes de compilar
RUN npx prisma generate
RUN npm run build

# Imagen final para producción
FROM node:18.18-alpine AS runner
WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm install --omit=dev

# Copiar la build y otros archivos necesarios
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# 💡 Asegurar que Prisma esté generado antes de ejecutar la app
RUN npx prisma generate

EXPOSE 3000
CMD ["node", "dist/main"]
