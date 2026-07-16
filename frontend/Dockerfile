# Build
FROM node:22-alpine AS builder

WORKDIR /app

# URL de l'API injectée AU BUILD : Vite inline import.meta.env.VITE_API_URL
# dans le bundle (impossible à changer au runtime). Fournie via --build-arg en
# CI (variable GitLab VITE_API_URL). Défaut = API de prod, pour ne JAMAIS
# retomber silencieusement sur http://localhost:8000 si la variable manque.
ARG VITE_API_URL="https://api.metaads.tybotflow.com"
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