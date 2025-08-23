#!/bin/bash
set -euo pipefail

# Simple colored logging helpers (used by this script)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

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

# Setup native GPU inference (uses host GPU directly without Docker CUDA image)
print_status "Setting up native GPU inference service..."
(
  cd BE/inference-yolo
  ./run-native-gpu.sh --setup
)

# Bring up the rest of the stack but do not start the compose-managed yolo-inference service
# (we'll run it separately so we can pass --gpus). Compose accepts --scale to set replicas to 0.
docker compose --env-file .env.gcp.local -f docker-compose.yml -f docker-compose.gcp.yml --profile gcp up --build --scale yolo-inference=0 -d

# Start the native GPU inference service separately (detached)
print_status "Starting native GPU inference service..."
(cd BE/inference-yolo && ./run-native-gpu.sh -d)

echo "Simple FE should be available at http://${PUBLIC_IP}:3003"

# cleanup local env copy (keep for debugging if you want)
trap 'rm -f .env.gcp.local ${GPU_OVERRIDE_FILE}' EXIT
