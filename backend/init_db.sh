#!/usr/bin/env bash

# This script can be run to initially add a guild and user to the database

set -e

# CONFIGURE THIS STUFF:
GUILD_ID="579466138992508928"
GUILD_NAME="bot stuff"
USER_ID="255834596766253057"


DIR=$(dirname $0)

set -o allexport
[ -f "$DIR/bot.env" ] && source "$DIR/bot.env"
[ -f "$DIR/api.env" ] && source "$DIR/api.env"
set +o allexport
RUN_QUERY="
mysql \
	-h $DB_HOST \
	-u $DB_USER \
	-p$DB_PASSWORD \
	-s
"

if ! command -v "mysql" &> /dev/null; then
	echo "You do not have mysql installed on your system. Please install it and try again."
	exit 1
fi

$RUN_QUERY <<SQL
CREATE DATABASE IF NOT EXISTS $DB_DATABASE;
SQL

$RUN_QUERY -D $DB_DATABASE <<SQL
SET time_zone = '+0:00';
SQL

echo "Running database migrations"
npm run --silent migrate-dev

$RUN_QUERY -D $DB_DATABASE <<SQL
START TRANSACTION;

INSERT INTO allowed_guilds (id, name, owner_id)
VALUES ($GUILD_ID, '$GUILD_NAME', $USER_ID)
RETURNING 'INSERT allowed_guilds';

INSERT INTO api_permissions (guild_id, target_id, type, permissions)
VALUES ($GUILD_ID, $USER_ID, 'USER', 'OWNER')
RETURNING 'INSERT api_permissions';

COMMIT;
SQL
