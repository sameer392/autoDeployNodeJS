#!/bin/bash
# Regenerate kong.yml from base + project routes, and override Traefik rule from hosts.
# Called by setup-shared (initial) and add-project (after adding a project).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="${SCRIPT_DIR}/shared"
HOSTS_FILE="${SHARED_DIR}/kong-hosts.txt"
KONG_BASE="${SHARED_DIR}/volumes/api/kong-base.yml"
KONG_OUT="${SHARED_DIR}/volumes/api/kong.yml"
OVERRIDE="${SHARED_DIR}/docker-compose.override.yml"

# Merge kong-base + all kong-projects-*.yml
PROJ_FILE="${SHARED_DIR}/volumes/api/kong-projects-merged.tmp"
: > "$PROJ_FILE"
for f in "${SHARED_DIR}"/volumes/api/kong-projects-*.yml 2>/dev/null; do
  [ -f "$f" ] && cat "$f" >> "$PROJ_FILE"
done

if [ -f "$KONG_BASE" ]; then
  if [ -s "$PROJ_FILE" ]; then
    # Insert project services before "  ## Protected Dashboard"
    awk '
      NR==FNR { proj = proj $0 "\n"; next }
      /  ## Protected Dashboard/ { printf "%s", proj }
      { print }
    ' "$PROJ_FILE" "$KONG_BASE" > "${KONG_OUT}.tmp"
    mv "${KONG_OUT}.tmp" "$KONG_OUT"
  else
    cp "$KONG_BASE" "$KONG_OUT"
  fi
fi
rm -f "$PROJ_FILE"

# Regenerate Traefik rule from hosts
if [ -f "$HOSTS_FILE" ] && [ -f "$OVERRIDE" ]; then
  HOSTS=()
  while IFS= read -r h; do
    [ -n "$h" ] && HOSTS+=("$h")
  done < "$HOSTS_FILE"
  RULE=""
  for h in "${HOSTS[@]}"; do
    [ -n "$RULE" ] && RULE="${RULE} || "
    RULE="${RULE}Host(\`${h}\`)"
  done
  [ -z "$RULE" ] && RULE="Host(\`localhost\`)"
  sed -i "s|traefik.http.routers.supabase-shared.rule=.*|traefik.http.routers.supabase-shared.rule=${RULE}|" "$OVERRIDE"
fi
