#!/bin/bash

# Start script for Sevalla deployment
echo "Starting DCMS application..."

# Cache configuration
echo "Caching Laravel configuration..."
cd bend && php artisan config:cache
cd bend && php artisan route:cache
cd bend && php artisan view:cache

# Start queue listener in background
echo "Starting queue listener..."
(cd bend && php artisan queue:listen) &
QUEUE_PID=$!

# Start scheduler in background (runs every minute)
echo "Starting scheduler..."
(
  while true; do
    cd bend && php artisan schedule:run --verbose --no-interaction
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
cd bend && php artisan serve --host=0.0.0.0 --port=$PORT
