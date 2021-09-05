#!/bin/bash

git fetch origin
git reset --hard origin/bens-stuff
docker-compose up --force-recreate --build -d
docker image prune -f
