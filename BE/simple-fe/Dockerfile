FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY . ./
RUN npm install --production || true
# entrypoint will generate config.js from env then start server
ENTRYPOINT ["/bin/sh","/app/docker-entrypoint.sh"]
CMD ["npm","start"]
