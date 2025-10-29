
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy source code
COPY . .

# Expose API port (change if needed)
EXPOSE 5005

# Start the server
CMD ["npm", "start"]
