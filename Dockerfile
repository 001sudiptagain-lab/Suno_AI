FROM node:20-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy all application directories, modules, assets, and configurations
COPY public/ ./public/
COPY src/ ./src/
COPY config/ ./config/
COPY server.js ./
COPY tool_dispatcher.py ./

# Railway exposes dynamic PORT, defaulting to 3000
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
