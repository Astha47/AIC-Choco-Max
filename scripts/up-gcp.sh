#!/bin/bash
set -euo pipefail

# Usage: ./scripts/up-gcp.sh <PUBLIC_IP>
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <PUBLIC_IP>"
  exit 1
fi
PUBLIC_IP="$1"

if [ ! -f .env.gcp ]; then
  echo ".env.gcp not found"
  exit 1
fi

# create a local copy and substitute the public IP
cp .env.gcp .env.gcp.local
sed -i "s|\${PUBLIC_IP}|${PUBLIC_IP}|g" .env.gcp.local

# Load env file safely into the environment for docker compose
set -a
. ./.env.gcp.local
set +a

echo "Starting in GCP mode with PUBLIC_IP=${PUBLIC_IP}"
docker compose --env-file .env.gcp.local -f docker-compose.yml -f docker-compose.gcp.yml --profile gcp up --build

echo "Simple FE should be available at http://${PUBLIC_IP}:3003"

# cleanup local env copy (keep for debugging if you want)
trap 'rm -f .env.gcp.local' EXIT
