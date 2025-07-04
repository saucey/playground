FROM node:20

WORKDIR /app/server

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 5555

CMD ["npm", "run", "dev"]
