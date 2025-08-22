FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package.json first to leverage Docker layer caching
COPY package.json package-lock.json* ./

# No dependencies to install for this simple static server, but keep npm ci if package-lock present
RUN if [ -f package-lock.json ]; then npm ci --only=production; fi || true

# Copy the rest of the frontend files
COPY . .

EXPOSE 3003

ENV PORT=3003

CMD ["node", "server.js"]
