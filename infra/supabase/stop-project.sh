#!/bin/bash
# Stop and remove a Supabase project
# Usage: ./stop-project.sh <project_slug>
# Handles both: per-project stacks (create-project) and shared-stack projects (add-project)

set -e
SLUG="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="${SCRIPT_DIR}/shared"
SUPABASE_DIR="${SCRIPT_DIR}/supabase"

if [ -z "$SLUG" ]; then
  echo "Usage: $0 <project_slug>"
  exit 1
fi

# Check if this is a shared-stack project (add-project)
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "supabase-project-${SLUG}-rest"; then
  echo "Stopping shared Supabase project: $SLUG"
  docker stop "supabase-project-${SLUG}-rest" 2>/dev/null || true
  docker stop "supabase-project-${SLUG}-realtime" 2>/dev/null || true
  docker rm "supabase-project-${SLUG}-rest" 2>/dev/null || true
  docker rm "supabase-project-${SLUG}-realtime" 2>/dev/null || true
  # Remove from Kong config and extract host to remove from kong-hosts
  PROJ_FILE="${SHARED_DIR}/volumes/api/kong-projects-${SLUG}.yml"
  if [ -f "$PROJ_FILE" ]; then
    HOST=$(grep -oE 'hosts: \["[^"]+"\]' "$PROJ_FILE" | head -1 | sed 's/hosts: \["\([^"]*\)"\]/\1/')
    rm -f "$PROJ_FILE"
    if [ -n "$HOST" ] && [ -f "${SHARED_DIR}/kong-hosts.txt" ]; then
      grep -v "^${HOST}$" "${SHARED_DIR}/kong-hosts.txt" > "${SHARED_DIR}/kong-hosts.txt.tmp"
      mv "${SHARED_DIR}/kong-hosts.txt.tmp" "${SHARED_DIR}/kong-hosts.txt"
    fi
  fi
  "${SCRIPT_DIR}/regen-kong-and-override.sh" 2>/dev/null || true
  docker restart supabase-shared-kong 2>/dev/null || true
  echo "Project $SLUG removed from shared Supabase."
  exit 0
fi

# Per-project stack (create-project)
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
