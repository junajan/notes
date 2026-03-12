# Stage 1: Build
FROM node:20-slim AS build

WORKDIR /app

# Copy package files for dependency resolution
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies
RUN npm install

# Copy source code
COPY packages/shared ./packages/shared
COPY frontend ./frontend

# Build frontend
WORKDIR /app/frontend
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy built files
COPY --from=build /app/frontend/dist /usr/share/nginx/html

# Add custom Nginx config for SPA and proxying
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
