# Use official Node.js LTS (Long Term Support) image
FROM node:20-alpine

# Set working directory inside container
WORKDIR /app

# Install system dependencies for better security and performance
RUN apk add --no-cache \
    tini \
    dumb-init \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install dependencies with production optimizations
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Create public directory and move static files
RUN mkdir -p public && cp -r interfaces/* public/ && rm -rf interfaces

# Change ownership to nodejs user for security
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose the port the app runs on
EXPOSE 5000

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "const http = require('http'); \
    const options = { hostname: 'localhost', port: 5000, path: '/api/ping', timeout: 2000 }; \
    const req = http.request(options, (res) => process.exit(res.statusCode === 200 ? 0 : 1)); \
    req.on('error', () => process.exit(1)); \
    req.end();"

# Use tini for proper signal handling
ENTRYPOINT ["tini", "--"]

# Start the application
CMD ["node", "server.js"]