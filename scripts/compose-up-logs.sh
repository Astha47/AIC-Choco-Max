#!/usr/bin/env bash
# Helper: runs docker-compose up and saves combined logs to ./logs/compose-up.log
set -euo pipefail
mkdir -p ./logs/hivemq
LOGFILE=./logs/compose-up.log
echo "Starting docker-compose and saving combined output to $LOGFILE"
# Run compose in detached mode and tail logs to file
docker-compose up -d
# Wait a few seconds for services to start
sleep 2
# Follow logs and write to file (runs until user Ctrl-C)
docker-compose logs -f | tee -a "$LOGFILE"
