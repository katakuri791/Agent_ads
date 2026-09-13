# Build
FROM node:22-alpine AS builder

WORKDIR /app

# URL de l'API injectée AU BUILD : Vite inline import.meta.env.VITE_API_URL
# dans le bundle (impossible a changer au runtime). Fournie via --build-arg en
# CI. Defaut = API de prod, pour ne JAMAIS retomber sur http://localhost:8000
# si la variable manque.
ARG VITE_API_URL="https://metaads-api.tybotflow.com"
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# Production
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]