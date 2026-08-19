FROM node:24-alpine

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend ./
COPY database /app/database

EXPOSE 3000

CMD ["npm", "start"]
