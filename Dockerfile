FROM node:20-alpine

WORKDIR /app

COPY package.json ./
# Без зависимостей, но копируем package-lock (если появится) для воспроизводимости
COPY package-lock.json* ./
RUN npm install --omit=dev || true

COPY . .

ENV NODE_ENV=production
ENV PORT=8080

# Рекорды хранятся в data/ — сделаем томом
RUN mkdir -p data

EXPOSE 8080

USER node

CMD ["node", "server.js"]
