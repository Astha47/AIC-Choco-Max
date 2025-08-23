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
print_status "Preparing isolated Python environment for native GPU inference..."

# Prefer conda (GCP DL images usually have conda). If not available, fall back to venv.
INFERENCE_ENV_NAME="aic-inference"
INFERENCE_DIR="$(pwd)/BE/inference-yolo"

if command -v conda >/dev/null 2>&1; then
  print_status "Conda detected — ensuring environment ${INFERENCE_ENV_NAME} exists"
  # Create env only if missing
  if ! conda env list | awk '{print $1}' | grep -xq "${INFERENCE_ENV_NAME}"; then
    print_status "Creating conda env ${INFERENCE_ENV_NAME} (python 3.10)"
    conda create -y -n "${INFERENCE_ENV_NAME}" python=3.10
  else
    print_status "Conda env ${INFERENCE_ENV_NAME} already exists — skipping creation"
  fi

  print_status "Activating conda env ${INFERENCE_ENV_NAME} and installing dependencies"
  # shellcheck disable=SC1091
  . "$(conda info --base)/etc/profile.d/conda.sh"
  conda activate "${INFERENCE_ENV_NAME}"

  # Run setup inside the env (the setup script filters torch lines)
  (cd "${INFERENCE_DIR}" && ./run-native-gpu.sh --setup)

  # Deactivate to avoid leaking env into caller
  conda deactivate
else
  print_warning "Conda not found — falling back to Python venv at ${INFERENCE_DIR}/.venv"
  if [ ! -d "${INFERENCE_DIR}/.venv" ]; then
    python3 -m venv "${INFERENCE_DIR}/.venv"
  fi
  # Activate venv and run setup
  # shellcheck disable=SC1091
  source "${INFERENCE_DIR}/.venv/bin/activate"
  (cd "${INFERENCE_DIR}" && ./run-native-gpu.sh --setup)
  deactivate
fi

# Bring up the rest of the stack but do not start the compose-managed yolo-inference service
# (we'll run it separately so we can pass --gpus). Compose accepts --scale to set replicas to 0.
docker compose --env-file .env.gcp.local -f docker-compose.yml -f docker-compose.gcp.yml --profile gcp up --build --scale yolo-inference=0 -d

# Start the native GPU inference service separately (detached) inside the isolated env
print_status "Starting native GPU inference service inside isolated environment..."
if command -v conda >/dev/null 2>&1; then
  # Activate conda env and launch
  . "$(conda info --base)/etc/profile.d/conda.sh"
  conda activate "${INFERENCE_ENV_NAME}"
  (cd "${INFERENCE_DIR}" && ./run-native-gpu.sh -d)
  conda deactivate
else
  source "${INFERENCE_DIR}/.venv/bin/activate"
  (cd "${INFERENCE_DIR}" && ./run-native-gpu.sh -d)
  deactivate
fi

echo "Simple FE should be available at http://${PUBLIC_IP}:3003"

# cleanup local env copy (keep for debugging if you want)
trap 'rm -f .env.gcp.local ${GPU_OVERRIDE_FILE}' EXIT
