FROM node:20-alpine

# Install system tools needed by main.sh and terminal operations
RUN apk add --no-cache \
    bash \
    openssh-client \
    curl \
    git \
    openssl \
    whiptail \
    python3

# Install WeTTY globally
RUN npm install -g wetty

# Create non-root user for terminal sessions
RUN addgroup -S terminal && adduser -S -G terminal -s /bin/bash terminal

# Copy Node server dependencies and code
COPY --chown=root:root hosting/apps/terminal/package.json /app/
WORKDIR /app
RUN npm install --production

COPY --chown=root:root hosting/apps/terminal/server.js /app/

# Copy per-session wrapper script
COPY --chown=root:root hosting/apps/terminal/run-session.sh /usr/local/bin/
RUN chmod 755 /usr/local/bin/run-session.sh

EXPOSE 3000

USER terminal

CMD ["npm", "start"]
