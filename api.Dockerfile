FROM node

WORKDIR /usr/src/app

RUN \
  git config --global url."https://github.com:".insteadOf git@github.com/ && \
  git config --global url."https://".insteadOf ssh://

WORKDIR /usr/src/app/backend

COPY backend/package* ./

RUN npm i

WORKDIR /usr/src/app

COPY . .

RUN rm -rf dashboard/

WORKDIR /usr/src/app/backend

RUN npm run build

CMD ["npm", "run", "start-api-prod"]
