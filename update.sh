#!/bin/bash

# # Load nvm
# . ~/.nvm/nvm.sh
# 
# # Run update
# nvm use
# git pull
# npm ci
# npm run build
# pm2 restart process.json

git fetch origin
git reset --hard origin/bens-stuff
docker-compose up --force-recreate --build -d
docker image prune -f
