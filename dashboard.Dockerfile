FROM node AS builder

RUN npm i -g rimraf

RUN \
  git config --global url."https://github.com:".insteadOf git@github.com/ && \
  git config --global url."https://".insteadOf ssh://

WORKDIR /usr/src/app

COPY dashboard/package* dashboard/
COPY backend/package* backend/

WORKDIR /usr/src/app/dashboard

RUN npm i

WORKDIR /usr/src/app/backend

RUN npm i

WORKDIR /usr/src/app

COPY . .

WORKDIR /usr/src/app/dashboard

RUN npm run build

# ------------------------------------------------------------------------------

FROM caddy:alpine

WORKDIR /usr/src/app

COPY ./dashboard/Caddyfile /etc/caddy/Caddyfile

COPY --from=builder /usr/src/app/dashboard/dist dist/

CMD ["/usr/bin/caddy",  "run", "--config", "/etc/caddy/Caddyfile"]
