FROM node:20-alpine

WORKDIR /app

ARG CACHEBUST=1
RUN echo "cachebust=${CACHEBUST}"

COPY package.json ./
COPY next.config.mjs ./
COPY tsconfig.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0", "-p", "3000"]
