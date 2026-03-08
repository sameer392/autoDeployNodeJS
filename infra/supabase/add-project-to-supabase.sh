#!/bin/bash
# Add a project database to the shared Supabase stack.
# Usage: ./add-project-to-supabase.sh <project_slug> <domain>
# Example: ./add-project-to-supabase.sh bolt4 bolt4.pdfsaas.com
#
# Creates: database project_bolt4, PostgREST + Realtime containers, Kong routes for api.bolt4.pdfsaas.com

set -e

SLUG="$1"
DOMAIN="$2"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="${SCRIPT_DIR}/shared"
SUPABASE_DIR="${SCRIPT_DIR}/supabase"
PROJECT_DB="project_${SLUG}"
API_DOMAIN="api.${DOMAIN}"
API_URL="https://${API_DOMAIN}"

if [ -z "$SLUG" ] || [ -z "$DOMAIN" ]; then
  echo "Usage: $0 <project_slug> <domain>"
  echo "Example: $0 bolt4 bolt4.pdfsaas.com"
  exit 1
fi

if ! [[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Error: slug must be lowercase alphanumeric with hyphens"
  exit 1
fi

# Check shared stack is running
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^supabase-shared-db$'; then
  echo "Error: Shared Supabase is not running. Run setup-shared-supabase.sh first from the main page."
  exit 1
fi

if [ ! -f "$SHARED_DIR/.env" ]; then
  echo "Error: Shared Supabase config not found. Run setup-shared-supabase.sh first."
  exit 1
fi

# Load shared env
set -a
source "$SHARED_DIR/.env"
set +a

# Check if project already exists
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "supabase-project-${SLUG}-rest"; then
  echo "Project ${SLUG} already added to shared Supabase."
  exit 0
fi

echo "Adding project ${SLUG} (${API_DOMAIN}) to shared Supabase..."

# Create database in shared Postgres
docker exec supabase-shared-db psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = '${PROJECT_DB}'" | grep -q 1 || \
  docker exec supabase-shared-db psql -U postgres -c "CREATE DATABASE ${PROJECT_DB};"

# Grant connect to roles (run from postgres DB)
docker exec supabase-shared-db psql -U postgres -d postgres -c "GRANT CONNECT ON DATABASE ${PROJECT_DB} TO anon, authenticated, service_role;" 2>/dev/null || true

# Init project DB (extensions, schemas, grants)
docker exec -i supabase-shared-db psql -U postgres -d "${PROJECT_DB}" < "${SCRIPT_DIR}/init-project-db.sql"

# JWT config for PostgREST
docker exec supabase-shared-db psql -U postgres -c "ALTER DATABASE ${PROJECT_DB} SET \"app.settings.jwt_secret\" TO '${JWT_SECRET}';"
docker exec supabase-shared-db psql -U postgres -c "ALTER DATABASE ${PROJECT_DB} SET \"app.settings.jwt_exp\" TO '3600';"

# Start PostgREST for this project (on shared network)
docker run -d \
  --name "supabase-project-${SLUG}-rest" \
  --restart unless-stopped \
  --network supabase-shared_default \
  -e "PGRST_DB_URI=postgres://authenticator:${POSTGRES_PASSWORD}@supabase-shared-db:5432/${PROJECT_DB}" \
  -e "PGRST_DB_SCHEMAS=public,storage,graphql_public" \
  -e "PGRST_DB_ANON_ROLE=anon" \
  -e "PGRST_JWT_SECRET=${JWT_SECRET}" \
  -e "PGRST_APP_SETTINGS_JWT_SECRET=${JWT_SECRET}" \
  -e "PGRST_APP_SETTINGS_JWT_EXP=${JWT_EXPIRY:-3600}" \
  postgrest/postgrest:v14.5

# Start Realtime for this project
docker run -d \
  --name "supabase-project-${SLUG}-realtime" \
  --restart unless-stopped \
  --network supabase-shared_default \
  -e "PORT=4000" \
  -e "DB_HOST=supabase-shared-db" \
  -e "DB_PORT=5432" \
  -e "DB_USER=supabase_admin" \
  -e "DB_PASSWORD=${POSTGRES_PASSWORD}" \
  -e "DB_NAME=${PROJECT_DB}" \
  -e "DB_AFTER_CONNECT_QUERY=SET search_path TO _realtime" \
  -e "DB_ENC_KEY=supabaserealtime" \
  -e "API_JWT_SECRET=${JWT_SECRET}" \
  -e "SECRET_KEY_BASE=${SECRET_KEY_BASE}" \
  -e "ERL_AFLAGS=-proto_dist inet_tcp" \
  -e "DNS_NODES=''''" \
  -e "RLIMIT_NOFILE=10000" \
  -e "APP_NAME=realtime" \
  -e "SEED_SELF_HOST=true" \
  -e "RUN_JANITOR=true" \
  -e "DISABLE_HEALTHCHECK_LOGGING=true" \
  supabase/realtime:v2.76.5

# Connect to hosting_network for Kong (Kong and project containers on same network)
docker network connect hosting_network "supabase-project-${SLUG}-rest" 2>/dev/null || true
docker network connect hosting_network "supabase-project-${SLUG}-realtime" 2>/dev/null || true

# Add Kong routes for api.project-domain
PROJECT_ROUTES="${SHARED_DIR}/volumes/api/kong-projects-${SLUG}.yml"
mkdir -p "$(dirname "$PROJECT_ROUTES")"

cat > "$PROJECT_ROUTES" << KONGPROJ
# Project ${SLUG} - api.${DOMAIN}
  - name: rest-v1-${SLUG}
    url: http://supabase-project-${SLUG}-rest:3000/
    routes:
      - name: rest-v1-${SLUG}-r
        strip_path: true
        paths: ["/rest/v1/"]
        hosts: ["${API_DOMAIN}"]
    plugins:
      - name: cors
      - name: key-auth
        config: { hide_credentials: true }
      - name: acl
        config: { hide_groups_header: true, allow: [admin, anon] }
  - name: realtime-ws-${SLUG}
    url: http://supabase-project-${SLUG}-realtime:4000/socket
    protocol: ws
    routes:
      - name: realtime-ws-${SLUG}-r
        strip_path: true
        paths: ["/realtime/v1/"]
        hosts: ["${API_DOMAIN}"]
    plugins:
      - name: cors
      - name: key-auth
        config: { hide_credentials: false }
      - name: acl
        config: { hide_groups_header: true, allow: [admin, anon] }
  - name: realtime-api-${SLUG}
    url: http://supabase-project-${SLUG}-realtime:4000/api
    protocol: http
    routes:
      - name: realtime-api-${SLUG}-r
        strip_path: true
        paths: ["/realtime/v1/api"]
        hosts: ["${API_DOMAIN}"]
    plugins:
      - name: cors
      - name: key-auth
        config: { hide_credentials: false }
      - name: acl
        config: { hide_groups_header: true, allow: [admin, anon] }
KONGPROJ

# Add host to list and regenerate Kong + Traefik override
echo "${API_DOMAIN}" >> "${SHARED_DIR}/kong-hosts.txt"
"${SCRIPT_DIR}/regen-kong-and-override.sh"

# Restart Kong and recreate to apply new config + Traefik labels
docker restart supabase-shared-kong 2>/dev/null || true
cd "$SUPABASE_DIR/docker"
docker compose -p "supabase-shared" \
  -f docker-compose.yml \
  -f "$SHARED_DIR/docker-compose.override.yml" \
  --env-file "$SHARED_DIR/.env" \
  up -d kong

# Save project .env for migrations (same dir structure as before for compatibility)
PROJECT_DIR="${SCRIPT_DIR}/projects/${SLUG}"
mkdir -p "$PROJECT_DIR"
cat > "$PROJECT_DIR/.env" << PROJENV
# Project ${SLUG} - shared Supabase
# API: ${API_URL}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
POSTGRES_HOST=supabase-shared-db
POSTGRES_DB=${PROJECT_DB}
PROJENV

echo ""
echo "=== Project ${SLUG} added to shared Supabase ==="
echo ""
echo "API URL: ${API_URL}"
echo "Database: ${PROJECT_DB}"
echo ""
