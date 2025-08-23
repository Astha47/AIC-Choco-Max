#!/bin/bash
set -e

echo "Starting in DEV mode (profile: dev)"
if [ ! -f .env.dev ]; then
	echo ".env.dev not found"
	exit 1
fi

# Load env file safely (ignore comments/blank lines)
set -a
. .env.dev
set +a

echo "Starting in DEV mode (profile: dev)"
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml --profile dev up -d --build

echo "Simple FE should be available at http://localhost:${FE_PORT}"
