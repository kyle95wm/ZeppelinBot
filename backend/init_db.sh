#!/usr/bin/env bash

# This script can be run to initially add a guild and user to the database

set -e

# CONFIGURE THIS STUFF:
GUILD_ID="579466138992508928"
GUILD_NAME="bot stuff"
USER_ID="255834596766253057"
BASE_URL="https://dev.red-panda.red" # used for logs
# remove the following line if you are not using docker-compose
DOCKER_COMPOSE_SERVICE="mariadb"

OWNERS=(
	$USER_ID
)

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

if [[ "$DOCKER_COMPOSE_SERVICE" != "" ]]; then
  RUN_QUERY="docker-compose exec -T $DOCKER_COMPOSE_SERVICE mysql -u $DB_USER -p$DB_PASSWORD"
fi

_OWNERS="["

for owner in "${OWNERS[@]}"; do
	_OWNERS+="\"$owner\","
done

OWNERS=$(jq . -c <<< "${_OWNERS%?}]")

GLOBAL_CONFIG=$(
	jq -c . <<JSON
{
  "prefix": "zep:",
	"url": "$BASE_URL",
	"owners": $OWNERS,
	"plugins": {
		"bot_control": {}
	}
}
JSON
)

$RUN_QUERY <<SQL
CREATE DATABASE IF NOT EXISTS $DB_DATABASE;
SQL

$RUN_QUERY -D $DB_DATABASE <<SQL
SET time_zone = '+0:00';
SQL

# echo "Running database migrations"
# cd $DIR
# npm run --silent migrate-dev

$RUN_QUERY -D $DB_DATABASE <<SQL
START TRANSACTION;

INSERT INTO allowed_guilds (id, name, owner_id)
VALUES ($GUILD_ID, '$GUILD_NAME', $USER_ID)
RETURNING 'INSERT allowed_guilds';

INSERT INTO api_permissions (guild_id, target_id, type, permissions)
VALUES ($GUILD_ID, $USER_ID, 'USER', 'OWNER')
RETURNING 'INSERT api_permissions';

INSERT INTO configs (\`key\`, config, is_active, edited_by)
VALUES ('global', '$GLOBAL_CONFIG', 1, $USER_ID)
RETURNING 'INSERT configs';

COMMIT;
SQL
