FROM node:22-bookworm-slim AS build
WORKDIR /src
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY mobile/package.json mobile/package-lock.json ./
RUN npm ci
COPY mobile/ ./
ENV EXPO_PUBLIC_API_BASE_URL=https://api.nimbusnova.cc
ENV CI=1
RUN npx expo export --platform web

FROM nginx:1.28-alpine
COPY deploy/nginx-app.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
