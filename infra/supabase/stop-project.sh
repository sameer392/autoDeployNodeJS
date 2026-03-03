#!/bin/bash
# Stop and remove a Supabase project
# Usage: ./stop-project.sh <project_slug>

set -e
SLUG="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPABASE_DIR="${SCRIPT_DIR}/supabase"

if [ -z "$SLUG" ]; then
  echo "Usage: $0 <project_slug>"
  exit 1
fi

PROJECT_DIR="${SCRIPT_DIR}/projects/${SLUG}"
if [ ! -f "$PROJECT_DIR/docker-compose.override.yml" ]; then
  echo "Project $SLUG not found"
  exit 1
fi

echo "Stopping Supabase project: $SLUG"
cd "$SUPABASE_DIR/docker"

docker compose -p "supabase-${SLUG}" \
  -f docker-compose.yml \
  -f "$PROJECT_DIR/docker-compose.override.yml" \
  down -v

echo "Project $SLUG stopped. To remove project data: rm -rf ${SCRIPT_DIR}/projects/${SLUG}"
