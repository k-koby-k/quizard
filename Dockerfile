FROM node:20-alpine

# app dir
WORKDIR /usr/src/app

# copy and install dependencies (use lockfile)
COPY package*.json ./
COPY package-lock.json ./
RUN npm ci --only=production

# copy source
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
