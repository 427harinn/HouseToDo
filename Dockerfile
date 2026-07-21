FROM node:22.17.1-bookworm-slim

WORKDIR /workspace

ENV CI=true

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

EXPOSE 5173 8787

CMD ["npm", "run", "dev"]
