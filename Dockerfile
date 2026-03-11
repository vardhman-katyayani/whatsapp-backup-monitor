FROM node:20-alpine

WORKDIR /app

# Copy server package files and install
COPY server/package*.json ./
RUN npm install --production

# Copy server source
COPY server/ .

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "index.js"]
