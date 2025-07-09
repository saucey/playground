FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build your app with NODE_ENV=production
RUN NODE_ENV=production npm run build

EXPOSE 3000

# Start using production command
CMD ["npm", "run", "start"]