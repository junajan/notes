# Use Node.js as the base image
FROM node:20-slim

# Install python and build tools for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the entire workspace to handle local dependencies
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies for all workspaces
RUN npm install

# Copy source code
COPY packages/shared ./packages/shared
COPY backend ./backend

# Build shared package if necessary (it's pure TS in this project)
# Build backend
WORKDIR /app/backend
RUN npm run build

# Create data directory for SQLite
RUN mkdir -p /app/backend/data

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV APP_PASSWORD=123
ENV JWT_SECRET=change-me-in-production

EXPOSE 3000

# Start the server
CMD ["npm", "run", "start"]
