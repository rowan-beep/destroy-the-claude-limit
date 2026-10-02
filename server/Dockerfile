# TRIAD game server. Official servers:  docker run -p 8080:8080 triad-server --official
# Your own:  docker run -p 8080:8080 triad-server --name "MY SERVER" --map frost
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs admin.html ./
EXPOSE 8080
ENTRYPOINT ["node", "server.mjs"]
