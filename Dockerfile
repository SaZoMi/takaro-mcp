FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

ENV PORT=3000
ENV MODULES_ROOT=/workspace/modules

EXPOSE 3000

CMD ["node", "dist/index.js"]
