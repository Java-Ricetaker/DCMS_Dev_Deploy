#!/bin/bash

# Start script for Sevalla deployment
echo "Starting DCMS application..."

# Determine the base directory
BASE_DIR="/app"
BEND_DIR="$BASE_DIR/bend"

# Check if bend directory exists
if [ ! -d "$BEND_DIR" ]; then
  echo "Error: $BEND_DIR directory not found!"
  echo "Current directory: $(pwd)"
  echo "Contents: $(ls -la)"
  exit 1
fi

# Check and generate APP_KEY if missing
cd "$BEND_DIR"
if [ -z "$APP_KEY" ] || [ "$APP_KEY" = "" ]; then
  echo "APP_KEY not set, generating..."
  php artisan key:generate --force
fi

# Ensure storage and cache directories are writable
echo "Setting up storage permissions..."
mkdir -p storage/framework/{sessions,views,cache}
mkdir -p storage/logs
mkdir -p bootstrap/cache
chmod -R 775 storage bootstrap/cache 2>/dev/null || true

# Cache configuration
echo "Caching Laravel configuration..."
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Start queue listener in background
echo "Starting queue listener..."
(cd "$BEND_DIR" && php artisan queue:listen) &
QUEUE_PID=$!

# Start scheduler in background (runs every minute)
echo "Starting scheduler..."
(
  while true; do
    cd "$BEND_DIR" && php artisan schedule:run --verbose --no-interaction
    sleep 60
  done
) &
SCHEDULER_PID=$!

# Function to cleanup background processes on exit
cleanup() {
  echo "Shutting down background processes..."
  kill $QUEUE_PID 2>/dev/null
  kill $SCHEDULER_PID 2>/dev/null
  exit
}

trap cleanup SIGTERM SIGINT

echo "Starting Laravel server..."
cd "$BEND_DIR" && php artisan serve --host=0.0.0.0 --port=$PORT
