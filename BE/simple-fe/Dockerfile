FROM node:18-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
COPY . ./
RUN npm install --production || true
# entrypoint will generate config.js from env then start server
ENTRYPOINT ["/bin/sh","/app/docker-entrypoint.sh"]
CMD ["npm","start"]

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

