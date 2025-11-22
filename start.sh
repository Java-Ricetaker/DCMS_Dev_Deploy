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

# Set default PORT if not provided
if [ -z "$PORT" ]; then
  PORT=8000
  echo "Warning: PORT environment variable not set, defaulting to $PORT"
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

# Run migrations and seed database
# Check if DB_CONNECTION is set, otherwise Laravel defaults may apply
if [ ! -z "$DB_CONNECTION" ] && [ "$DB_CONNECTION" != "" ]; then
  echo "DB_CONNECTION is set to: $DB_CONNECTION"
else
  echo "DB_CONNECTION not explicitly set, Laravel will use default configuration"
fi

echo "Running database migrations and seeding..."
echo "Executing: php artisan migrate:fresh --seed --force"
php artisan migrate:fresh --seed --force

MIGRATION_EXIT_CODE=$?
if [ $MIGRATION_EXIT_CODE -eq 0 ]; then
  echo "✅ Database migrations and seeding completed successfully"
else
  echo "❌ ERROR: Database migration and seeding failed with exit code $MIGRATION_EXIT_CODE"
  echo "This will prevent the application from starting correctly."
  exit $MIGRATION_EXIT_CODE
fi

# Clear old caches first to avoid stale config
echo "Clearing old caches..."
php artisan config:clear 2>&1 || true
php artisan route:clear 2>&1 || true
php artisan view:clear 2>&1 || true

# Cache configuration
echo "Caching Laravel configuration..."
php artisan config:cache 2>&1 || echo "Config cache failed"
php artisan route:cache 2>&1 || echo "Route cache failed"
php artisan view:cache 2>&1 || echo "View cache failed"

# Show recent errors if log file exists
if [ -f "storage/logs/laravel.log" ]; then
  echo "Recent Laravel errors (last 20 lines):"
  tail -n 20 storage/logs/laravel.log 2>/dev/null || echo "Could not read log file"
fi

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

echo "Starting Laravel server on port $PORT..."
cd "$BEND_DIR" && php artisan serve --host=0.0.0.0 --port=${PORT:-8000}
