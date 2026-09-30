FROM node:18-alpine

# Install build dependencies for native C++ modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy application source code
COPY . .

# Ensure data directory and uploads directory exist
RUN mkdir -p /app/data /app/uploads

# Configure container environment variables
ENV NODE_ENV=production
ENV PORT=5000
ENV SMTP_PORT=2525
ENV DATABASE_PATH=/app/data/zapmail.sqlite

# Expose HTTP REST / WebSocket port and SMTP protocol port
EXPOSE 5000 2525

# Launch server
CMD ["node", "server.js"]

